// dlprevent-guard: AnveGuard's policy engine as a self-contained proxy
// between an AI agent (Hermes) and its model provider.
//
// What is kept from upstream: the engine in supabase/functions/_shared,
// untouched, so rule updates can be taken over as they are. What is not:
// Supabase, Clerk, the Lovable classifier, the dashboard, the request log.
// This proxy stores nothing but verdicts, and a verdict carries rule names
// and reasons — never the prompt, the answer or the matched text.
//
// Flow per request:
//   1. What is new since the model last spoke — the user's turn and the
//      tool results — is scanned: user text as input, tool results as
//      retrieved content (the indirect-injection route an agent is hijacked
//      through).
//   2. GUARD_MODE=block refuses a request whose verdict is `block`;
//      GUARD_MODE=flag (the default) forwards everything and only reports.
//   3. The model's answer is scanned as output, including the tool calls it
//      asks for. A streamed answer is held until it has ended in block mode,
//      then passed on or refused; in flag mode it streams through and the
//      copy is scanned afterwards.
//
// Every verdict other than `allow` is appended as one JSON line to
// GUARD_LOG. The DLPrevent Linux agent reads that file and turns each line
// into an alert on the existing dashboard.

import {
  aggregate,
  DEFAULT_SETTINGS,
  evaluate,
  evaluateRetrieved,
  type LayerVerdict,
  type PolicySettings,
  type Verdict,
} from "../supabase/functions/_shared/policy_engine.ts";
import { evaluateAgentActions } from "./agent_rules.ts";

export type Mode = "flag" | "block";
export type Direction = "input" | "tool_result" | "output";

/** One scanned piece of text and where it came from. */
export interface Piece {
  direction: Direction;
  text: string;
  /** Tool name for a tool result. */
  origin?: string;
  /** For an answer: the arguments of its tool calls, what it will run. */
  calls?: string;
}

/** One line of the verdict log. Metadata only. */
export interface Record {
  at: string;
  direction: Direction;
  verdict: Verdict;
  action: "forwarded" | "blocked";
  /** The route the request took (`GUARD_UPSTREAMS`); absent for the default. */
  upstream?: string;
  model?: string;
  origin?: string;
  chars: number;
  layers: { layer: string; rule?: string; verdict: Verdict; reason?: string }[];
}

/** A reason can quote what it matched (a blocked keyword). Cut it short. */
const MAX_REASON = 160;

/** What the guard turns on beyond upstream's defaults: DLP on what goes to
 *  the model, and links in what comes back. Both only flag — a DLP hit is
 *  a finding, not a reason to stop the agent mid-task. A policy file can
 *  override any of it. */
export const GUARD_SETTINGS: PolicySettings = {
  ...DEFAULT_SETTINGS,
  enable_pii_detection: true,
  pii_action: "flag",
  enable_egress_filter: true,
  egress_action: "flag",
};

// ---------- extracting what is new ---------------------------------------

type Json = { [k: string]: unknown };

/** Text of a content field: a string, or OpenAI/Anthropic content parts. */
export function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((p) => {
      if (typeof p === "string") return p;
      const part = p as Json;
      if (typeof part.text === "string") return part.text;
      // Anthropic tool_result carries its own content.
      if (part.type === "tool_result") return textOf(part.content);
      return "";
    })
    .filter((s) => s.length > 0)
    .join("\n");
}

/**
 * The pieces a request adds since the model's last answer. Earlier turns
 * were scanned when they were new; scanning the whole history again would
 * report the same finding on every turn after it.
 *
 * Handles OpenAI chat (`role: "tool"`) and Anthropic messages (a user turn
 * whose content holds `tool_result` blocks). The system prompt is the
 * operator's own and is not scanned.
 */
export function newPieces(body: Json): Piece[] {
  return newSlots(body).map((s) => s.piece);
}

/** The new pieces, each with a way to replace its text in the request. */
function newSlots(body: Json): { piece: Piece; set: (text: string) => void }[] {
  const messages = Array.isArray(body.messages) ? (body.messages as Json[]) : [];
  let start = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "assistant") {
      start = i + 1;
      break;
    }
  }
  const out: { piece: Piece; set: (text: string) => void }[] = [];
  for (const m of messages.slice(start)) {
    if (m.role === "tool") {
      out.push({ piece: { direction: "tool_result", text: textOf(m.content), origin: str(m.name) ?? str(m.tool_call_id) }, set: (t) => (m.content = t) });
    } else if (m.role === "user") {
      if (Array.isArray(m.content)) {
        for (const part of m.content as Json[]) {
          if (part?.type === "tool_result") {
            out.push({ piece: { direction: "tool_result", text: textOf(part.content), origin: str(part.tool_use_id) }, set: (t) => (part.content = t) });
          } else if (typeof part?.text === "string") {
            out.push({ piece: { direction: "input", text: part.text }, set: (t) => (part.text = t) });
          }
        }
      } else {
        out.push({ piece: { direction: "input", text: textOf(m.content) }, set: (t) => (m.content = t) });
      }
    }
  }
  return out.filter((s) => s.piece.text.trim().length > 0);
}

/** What the model gets in place of a piece that was refused before. */
const withheld = (why: string) => `[withheld by dlprevent-guard: this content was refused earlier (${why}). Tell the user it was blocked; do not try to fetch it again.]`;

/** Refused pieces by hash, with the rules that refused them. The agent keeps
 *  a refused tool result or message in its history and sends it again with
 *  every later turn; refusing it again would end the session for good. From
 *  the second time on it is replaced, and the rest goes through. */
// ponytail: in memory, cleared when full or on restart — then the stuck
// piece is refused once more and remembered again.
const MAX_REFUSED = 10_000;

async function digest(text: string): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The model's answer as text, and the tools it asks for — from a complete
 *  (non-streamed) OpenAI or Anthropic response. Tool arguments count as
 *  text: they are where an exfiltration URL or a shell command sits. */
export function answerOf(resp: Json): { text: string; calls: string; tools: string[] } {
  const prose: string[] = [];
  const calls: string[] = [];
  const tools: string[] = [];
  const msg = (resp.choices as Json[] | undefined)?.[0]?.message as Json | undefined;
  if (msg) {
    prose.push(textOf(msg.content));
    for (const tc of (msg.tool_calls as Json[] | undefined) ?? []) {
      const f = tc.function as Json | undefined;
      if (str(f?.name)) tools.push(str(f?.name)!);
      if (str(f?.arguments)) calls.push(str(f?.arguments)!);
    }
  }
  for (const block of (Array.isArray(resp.content) ? resp.content : []) as Json[]) {
    if (block.type === "text" && str(block.text)) prose.push(str(block.text)!);
    if (block.type === "tool_use") {
      if (str(block.name)) tools.push(str(block.name)!);
      calls.push(JSON.stringify(block.input ?? {}));
    }
  }
  const join = (a: string[]) => a.filter((p) => p.length > 0).join("\n");
  return { text: join([...prose, ...calls]), calls: join(calls), tools };
}

/**
 * Collects a streamed answer (server-sent events) chunk by chunk, OpenAI
 * and Anthropic deltas alike, for one scan when the stream is over.
 */
export class StreamCollector {
  private rest = "";
  private parts: string[] = [];
  private callParts: string[] = [];
  tools: string[] = [];

  push(chunk: string) {
    const lines = (this.rest + chunk).split("\n");
    this.rest = lines.pop() ?? "";
    for (const line of lines) this.line(line.trim());
  }

  private line(line: string) {
    if (!line.startsWith("data:")) return;
    const data = line.slice(5).trim();
    if (data === "" || data === "[DONE]") return;
    let ev: Json;
    try {
      ev = JSON.parse(data);
    } catch {
      return;
    }
    const delta = (ev.choices as Json[] | undefined)?.[0]?.delta as Json | undefined;
    if (delta) {
      if (str(delta.content)) this.parts.push(str(delta.content)!);
      for (const tc of (delta.tool_calls as Json[] | undefined) ?? []) {
        const f = tc.function as Json | undefined;
        if (str(f?.name)) this.tools.push(str(f?.name)!);
        if (str(f?.arguments)) this.call(str(f?.arguments)!);
      }
    }
    const d = ev.delta as Json | undefined;
    if (ev.type === "content_block_delta" && d) {
      if (str(d.text)) this.parts.push(str(d.text)!);
      if (str(d.partial_json)) this.call(str(d.partial_json)!);
    }
    const block = ev.content_block as Json | undefined;
    if (ev.type === "content_block_start" && block?.type === "tool_use" && str(block.name)) this.tools.push(str(block.name)!);
  }

  private call(s: string) {
    this.parts.push(s);
    this.callParts.push(s);
  }

  text(): string {
    if (this.rest) this.line(this.rest.trim());
    this.rest = "";
    return this.parts.join("");
  }

  /** The tool-call arguments alone. Call after `text()`. */
  calls(): string {
    return this.callParts.join("");
  }
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

// ---------- judging -------------------------------------------------------

/** Scan one piece. Tool results go through the retrieved-content scanner
 *  on top of the ordinary input scan: instructions hidden in a web page or
 *  a file are the injection an agent actually falls for. */
export async function scan(p: Piece, settings: PolicySettings, ctx: { model?: string; tools?: string[] } = {}): Promise<{ verdict: Verdict; layers: LayerVerdict[] }> {
  const base = {
    legacy: { blocked_keywords: [], allowed_keywords: [], use_global_defaults: false },
    rules: [],
    intents: [],
    settings,
  };
  if (p.direction === "output") {
    const r = await evaluate({ ...base, text: p.text, direction: "output" }, { model: ctx.model, responseToolNames: ctx.tools });
    // What the agent is about to do: upstream judges text, not commands.
    const layers = [...r.layers, ...evaluateAgentActions(p.text, p.calls ?? "")];
    return { verdict: layers.length ? aggregate(layers, settings) : r.verdict, layers };
  }
  // A tool result is data, not a prompt. Upstream's heuristics look for
  // what a *person* hides in a prompt — encoded payloads, gibberish
  // suffixes, many-shot patterns — and a git log, a hash or a base64 blob
  // in a file is all of that by nature: on the first real Hermes session
  // every other tool result came back as `adversarial_suffix`. So for data:
  // no heuristics and no multi-turn analysis; the injection guard, the PII
  // check, the threat feed and upstream's scanner for retrieved content
  // stay.
  const tool = p.direction === "tool_result";
  const s = tool ? { ...settings, enable_heuristics: false, enable_behavioral: false } : settings;
  const r = await evaluate({ ...base, settings: s, text: p.text, direction: "input" }, { model: ctx.model });
  const layers = [...r.layers];
  if (tool) {
    layers.push(...evaluateRetrieved(p.text, { kind: "mcp_tool_result", origin: p.origin, consumer: "tool_router" }));
  }
  return { verdict: layers.length ? aggregate(layers, settings) : r.verdict, layers };
}

/** Which layer's reason an alert should lead with. The reader sees the
 *  first reason only, and upstream lists the vaguest first: "ignore all
 *  previous instructions" came out as "Persona-bypass language requesting an
 *  unrestricted model". The specific finding goes first, the heuristic last. */
const LEAD: { [layer: string]: number } = {
  injection: 0,
  egress: 1,
  tool_governance: 1,
  threat_intel: 2,
  keywords: 2,
  patterns: 3,
  classifier: 3,
  ml_detection: 3,
  heuristics: 5,
  behavioral: 6,
};

export function record(p: Piece, verdict: Verdict, layers: LayerVerdict[], blocked: boolean, model?: string, upstream?: string): Record {
  return {
    at: new Date().toISOString(),
    direction: p.direction,
    verdict,
    action: blocked ? "blocked" : "forwarded",
    upstream,
    model,
    origin: p.origin,
    chars: p.text.length,
    // `matched` and `spans` are left out on purpose: they are the text.
    layers: layers
      .filter((l) => l.verdict !== "allow")
      .sort((a, b) => (LEAD[a.layer] ?? 4) - (LEAD[b.layer] ?? 4))
      .map((l) => ({ layer: l.layer, rule: l.rule, verdict: l.verdict, reason: l.reason?.slice(0, MAX_REASON) })),
  };
}

// ---------- the proxy -----------------------------------------------------

/** One model provider the guard forwards to. */
export interface Upstream {
  /** Base URL without `/v1`: the agent's path is appended to it. */
  url: string;
  /** The provider key, if the guard is to set it. An agent that takes a
   *  127.0.0.1 address for a local model server sends a placeholder
   *  instead of its key (Hermes: `no-key-required`); then the guard has to
   *  carry the key itself — and once it does, the agent no longer needs
   *  one, so it cannot go around the guard with it either. Unset: the
   *  agent's key passes through. */
  key?: string;
}

export interface Config {
  /** Providers by name, reached under `/<name>/…` (`GUARD_UPSTREAMS`). One
   *  guard for every provider an agent uses: its subagents and helper tasks
   *  often talk to a different one than its main model, and whatever does
   *  not come through here is not scanned. */
  routes: { [name: string]: Upstream };
  /** For a path without a known route name (`GUARD_UPSTREAM`): the setup
   *  from before there were routes, `/v1/…` straight to one provider. */
  fallback?: Upstream;
  mode: Mode;
  log: string;
  settings: PolicySettings;
}

/** Names that would shadow a path of the APIs themselves. */
const RESERVED = ["v1", "api", "healthz", "props", "version", "chat", "messages", "models"];

/**
 * `GUARD_UPSTREAMS=deepseek=https://api.deepseek.com,openrouter=https://openrouter.ai/api`,
 * each key in `GUARD_KEY_<NAME>` (upper case, `-` as `_`). Throws on a line
 * that cannot be meant: a typo here would send a provider's traffic to the
 * wrong place, and the guard should refuse to start rather than guess.
 */
export function parseUpstreams(line: string | undefined, env: { [k: string]: string | undefined }): { [name: string]: Upstream } {
  const out: { [name: string]: Upstream } = {};
  for (const item of (line ?? "").split(",").map((s) => s.trim()).filter((s) => s.length > 0)) {
    const eq = item.indexOf("=");
    const name = eq > 0 ? item.slice(0, eq).trim() : "";
    const url = item.slice(eq + 1).trim().replace(/\/+$/, "");
    if (!/^[a-z0-9][a-z0-9_-]*$/i.test(name) || RESERVED.includes(name.toLowerCase())) {
      throw new Error(`GUARD_UPSTREAMS: "${name}" is not a usable route name (letters, digits, - and _; not ${RESERVED.join(", ")})`);
    }
    if (!/^https?:\/\/[^/]/.test(url)) throw new Error(`GUARD_UPSTREAMS: "${url}" for ${name} is not an http(s) URL`);
    const key = env[`GUARD_KEY_${name.toUpperCase().replace(/-/g, "_")}`];
    out[name] = key ? { url, key } : { url };
  }
  return out;
}

/** Where a request goes: the route its first path segment names, with that
 *  segment taken off, or the default provider with the path as it came. */
export function route(cfg: Config, pathname: string): { name?: string; url: string; key?: string; path: string } | undefined {
  const m = pathname.match(/^\/([^/]+)(\/.*)?$/);
  const r = m ? cfg.routes[m[1]] : undefined;
  if (m && r) return { name: m[1], url: r.url, key: r.key, path: m[2] ?? "/" };
  if (cfg.fallback) return { name: undefined, url: cfg.fallback.url, key: cfg.fallback.key, path: pathname };
  return undefined;
}

/** Paths whose bodies are scanned. Everything else passes through as is. */
const SCANNED = ["/v1/chat/completions", "/chat/completions", "/v1/messages"];

export function handler(cfg: Config, write: (r: Record) => Promise<void>) {
  const refused = new Map<string, string>();
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    if (url.pathname === "/healthz") return new Response("ok\n");
    const to = route(cfg, url.pathname);
    if (!to) {
      const names = Object.keys(cfg.routes).map((n) => `/${n}/`).join(", ");
      return Response.json({ error: { message: `dlprevent-guard: no provider for ${url.pathname} — use one of ${names}`, type: "guard_no_route" } }, { status: 404 });
    }
    const target = to.url + to.path + url.search;
    const headers = new Headers(req.headers);
    headers.delete("host");
    headers.delete("content-length");
    const anthropic = to.path.endsWith("/messages");
    if (to.key) {
      headers.set("authorization", `Bearer ${to.key}`);
      if (anthropic) headers.set("x-api-key", to.key);
    }

    if (req.method !== "POST" || !SCANNED.includes(to.path)) {
      return relay(await fetch(target, { method: req.method, headers, body: req.body }));
    }

    const raw = await req.text();
    let body: Json;
    try {
      body = JSON.parse(raw);
    } catch {
      return relay(await fetch(target, { method: "POST", headers, body: raw }));
    }
    const model = str(body.model);

    // Fail-open: a guard that throws must not take the agent down with it.
    let blockedBy: Record | undefined;
    let replaced = false;
    try {
      for (const { piece: p, set } of newSlots(body)) {
        const hash = await digest(p.text);
        const why = refused.get(hash);
        if (why !== undefined) {
          set(withheld(why));
          replaced = true;
          console.log(`guard: ${p.direction} withheld, refused before: ${why}`);
          continue;
        }
        const { verdict, layers } = await scan(p, cfg.settings, { model });
        if (verdict === "allow") continue;
        const block = cfg.mode === "block" && verdict === "block";
        const rec = record(p, verdict, layers, block, model, to.name);
        await write(rec);
        if (!block) continue;
        if (refused.size >= MAX_REFUSED) refused.clear();
        refused.set(hash, rec.layers.map((l) => l.rule ?? l.layer).join(", "));
        blockedBy ??= rec;
      }
    } catch (e) {
      console.error("guard: input scan failed, forwarding (fail-open):", e instanceof Error ? e.message : e);
    }
    if (blockedBy) return refusal(blockedBy, anthropic);

    const resp = await fetch(target, { method: "POST", headers, body: replaced ? JSON.stringify(body) : raw });
    const type = resp.headers.get("content-type") ?? "";
    if (!resp.ok || !resp.body) return relay(resp);

    if (type.includes("text/event-stream")) {
      if (cfg.mode === "flag") {
        // Stream to the agent at once; scan the copy when it has ended.
        const [toAgent, toScan] = resp.body.tee();
        scanStream(toScan, cfg, model, to.name, write);
        return relay(resp, toAgent);
      }
      // Block mode: a command can only be stopped before the agent has it.
      // On the Hermes host every answer came streamed, and a tool call on a
      // key file went through as `block forwarded`. So the whole stream is
      // held, scanned, and then passed on in one piece or refused.
      const sse = await resp.text();
      const rec = await scanSse(sse, cfg, model, to.name, write, true);
      if (rec?.action === "blocked") return refusal(rec, anthropic);
      return relay(resp, sse);
    }

    const text = await resp.text();
    try {
      const answer = answerOf(JSON.parse(text));
      if (answer.text) {
        const p: Piece = { direction: "output", text: answer.text, calls: answer.calls };
        const { verdict, layers } = await scan(p, cfg.settings, { model, tools: answer.tools });
        if (verdict !== "allow") {
          const block = cfg.mode === "block" && verdict === "block";
          const rec = record(p, verdict, layers, block, model, to.name);
          await write(rec);
          if (block) return refusal(rec, anthropic);
        }
      }
    } catch (e) {
      console.error("guard: output scan failed, forwarding (fail-open):", e instanceof Error ? e.message : e);
    }
    return relay(resp, text);
  };
}

async function scanStream(stream: ReadableStream<Uint8Array>, cfg: Config, model: string | undefined, upstream: string | undefined, write: (r: Record) => Promise<void>) {
  try {
    await scanSse(await new Response(stream).text(), cfg, model, upstream, write, false);
  } catch (e) {
    console.error("guard: stream scan failed:", e instanceof Error ? e.message : e);
  }
}

/** Scan a whole streamed answer. `mayBlock`: the agent does not have it yet. */
async function scanSse(sse: string, cfg: Config, model: string | undefined, upstream: string | undefined, write: (r: Record) => Promise<void>, mayBlock: boolean): Promise<Record | undefined> {
  try {
    const c = new StreamCollector();
    c.push(sse + "\n");
    const text = c.text();
    if (!text) return;
    const p: Piece = { direction: "output", text, calls: c.calls() };
    const { verdict, layers } = await scan(p, cfg.settings, { model, tools: c.tools });
    if (verdict === "allow") return;
    const rec = record(p, verdict, layers, mayBlock && cfg.mode === "block" && verdict === "block", model, upstream);
    await write(rec);
    return rec;
  } catch (e) {
    console.error("guard: stream scan failed, forwarding (fail-open):", e instanceof Error ? e.message : e);
  }
}

/** Upstream's answer to the agent. `fetch` has already decoded the body,
 *  so the encoding and length headers no longer describe it. */
function relay(resp: Response, body?: BodyInit | null): Response {
  const headers = new Headers(resp.headers);
  headers.delete("content-encoding");
  headers.delete("content-length");
  return new Response(body === undefined ? resp.body : body, { status: resp.status, statusText: resp.statusText, headers });
}

/** The error the agent sees, in the shape its SDK expects. */
function refusal(rec: Record, anthropic: boolean): Response {
  const why = rec.layers.map((l) => l.rule ?? l.layer).join(", ");
  const message = `Blocked by dlprevent-guard (${rec.direction}): ${why}`;
  const body = anthropic
    ? { type: "error", error: { type: "permission_error", message } }
    : { error: { message, type: "guard_blocked", code: "prompt_blocked" } };
  return new Response(JSON.stringify(body), { status: 403, headers: { "content-type": "application/json" } });
}

// ---------- start ---------------------------------------------------------

async function loadSettings(path: string | undefined): Promise<PolicySettings> {
  if (!path) return GUARD_SETTINGS;
  return { ...GUARD_SETTINGS, ...JSON.parse(await Deno.readTextFile(path)) };
}

if (import.meta.main) {
  let routes: { [name: string]: Upstream };
  try {
    routes = parseUpstreams(Deno.env.get("GUARD_UPSTREAMS"), Deno.env.toObject());
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    Deno.exit(1);
  }
  const single = Deno.env.get("GUARD_UPSTREAM")?.replace(/\/+$/, "");
  const fallback: Upstream | undefined = single ? { url: single, key: Deno.env.get("GUARD_UPSTREAM_KEY") || undefined } : undefined;
  if (!fallback && Object.keys(routes).length === 0) {
    console.error("no provider: set GUARD_UPSTREAM (one provider, e.g. https://api.deepseek.com) or GUARD_UPSTREAMS (name=url,…)");
    Deno.exit(1);
  }
  const mode = (Deno.env.get("GUARD_MODE") ?? "flag") as Mode;
  if (mode !== "flag" && mode !== "block") {
    console.error(`GUARD_MODE must be flag or block, not ${mode}`);
    Deno.exit(1);
  }
  const cfg: Config = {
    routes,
    fallback,
    mode,
    log: Deno.env.get("GUARD_LOG") ?? "/var/log/dlprevent-guard/verdicts.jsonl",
    settings: await loadSettings(Deno.env.get("GUARD_POLICY")),
  };
  const write = async (r: Record) => {
    console.log(`guard: ${r.direction} ${r.verdict} ${r.action} ${r.layers.map((l) => l.rule ?? l.layer).join(",")}`);
    await Deno.writeTextFile(cfg.log, JSON.stringify(r) + "\n", { append: true, create: true });
  };
  const port = Number(Deno.env.get("GUARD_PORT") ?? "8787");
  const keyOf = (u: Upstream) => (u.key ? "key set by the guard" : "key from the agent");
  console.log(`dlprevent-guard on :${port}, mode ${mode}, log ${cfg.log}`);
  if (fallback) console.log(`  /v1/…  -> ${fallback.url}, ${keyOf(fallback)}`);
  for (const [n, u] of Object.entries(routes)) console.log(`  /${n}/…  -> ${u.url}, ${keyOf(u)}`);
  const handle = handler(cfg, write);
  // One line per request: whether the agent goes through the guard at all
  // is the first thing anyone asks, and findings alone cannot answer it.
  // Method, path, status and time — no body, no header.
  Deno.serve({ port, hostname: "0.0.0.0" }, async (req) => {
    const t = performance.now();
    const resp = await handle(req);
    const path = new URL(req.url).pathname;
    // Whether a key came along, never the key: a 401 from the provider is
    // otherwise impossible to tell apart from a key the agent never sent.
    const auth = req.headers.has("authorization") || req.headers.has("x-api-key") ? "key" : "no key";
    if (path !== "/healthz") console.log(`${req.method} ${path} -> ${resp.status} ${Math.round(performance.now() - t)}ms (${auth})`);
    return resp;
  });
}
