// dlprevent-guard: AnveGuard's policy engine as a self-contained proxy
// between an AI agent (Hermes) and its model provider.
//
// What is kept from upstream: the engine in supabase/functions/_shared,
// untouched, so rule updates merge. What is not: Supabase, Clerk, the
// Lovable classifier, the dashboard, the request log. This proxy stores
// nothing but verdicts, and a verdict carries rule names and reasons —
// never the prompt, the answer or the matched text.
//
// Flow per request:
//   1. What is new since the model last spoke — the user's turn and the
//      tool results — is scanned: user text as input, tool results as
//      retrieved content (the indirect-injection route an agent is hijacked
//      through).
//   2. GUARD_MODE=block refuses a request whose verdict is `block`;
//      GUARD_MODE=flag (the default) forwards everything and only reports.
//   3. The model's answer is scanned as output, including the tool calls it
//      asks for. A streamed answer is scanned when the stream has ended, so
//      it is reported, never stopped.
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
}

/** One line of the verdict log. Metadata only. */
export interface Record {
  at: string;
  direction: Direction;
  verdict: Verdict;
  action: "forwarded" | "blocked";
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
  const messages = Array.isArray(body.messages) ? (body.messages as Json[]) : [];
  let start = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "assistant") {
      start = i + 1;
      break;
    }
  }
  const out: Piece[] = [];
  for (const m of messages.slice(start)) {
    if (m.role === "tool") {
      out.push({ direction: "tool_result", text: textOf(m.content), origin: str(m.name) ?? str(m.tool_call_id) });
    } else if (m.role === "user") {
      if (Array.isArray(m.content)) {
        for (const part of m.content as Json[]) {
          if (part?.type === "tool_result") {
            out.push({ direction: "tool_result", text: textOf(part.content), origin: str(part.tool_use_id) });
          } else if (typeof part?.text === "string") {
            out.push({ direction: "input", text: part.text });
          }
        }
      } else {
        out.push({ direction: "input", text: textOf(m.content) });
      }
    }
  }
  return out.filter((p) => p.text.trim().length > 0);
}

/** The model's answer as text, and the tools it asks for — from a complete
 *  (non-streamed) OpenAI or Anthropic response. Tool arguments count as
 *  text: they are where an exfiltration URL or a shell command sits. */
export function answerOf(resp: Json): { text: string; tools: string[] } {
  const parts: string[] = [];
  const tools: string[] = [];
  const msg = (resp.choices as Json[] | undefined)?.[0]?.message as Json | undefined;
  if (msg) {
    parts.push(textOf(msg.content));
    for (const tc of (msg.tool_calls as Json[] | undefined) ?? []) {
      const f = tc.function as Json | undefined;
      if (str(f?.name)) tools.push(str(f?.name)!);
      if (str(f?.arguments)) parts.push(str(f?.arguments)!);
    }
  }
  for (const block of (Array.isArray(resp.content) ? resp.content : []) as Json[]) {
    if (block.type === "text" && str(block.text)) parts.push(str(block.text)!);
    if (block.type === "tool_use") {
      if (str(block.name)) tools.push(str(block.name)!);
      parts.push(JSON.stringify(block.input ?? {}));
    }
  }
  return { text: parts.filter((p) => p.length > 0).join("\n"), tools };
}

/**
 * Collects a streamed answer (server-sent events) chunk by chunk, OpenAI
 * and Anthropic deltas alike, for one scan when the stream is over.
 */
export class StreamCollector {
  private rest = "";
  private parts: string[] = [];
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
        if (str(f?.arguments)) this.parts.push(str(f?.arguments)!);
      }
    }
    const d = ev.delta as Json | undefined;
    if (ev.type === "content_block_delta" && d) {
      if (str(d.text)) this.parts.push(str(d.text)!);
      if (str(d.partial_json)) this.parts.push(str(d.partial_json)!);
    }
    const block = ev.content_block as Json | undefined;
    if (ev.type === "content_block_start" && block?.type === "tool_use" && str(block.name)) this.tools.push(str(block.name)!);
  }

  text(): string {
    if (this.rest) this.line(this.rest.trim());
    this.rest = "";
    return this.parts.join("");
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
    const layers = [...r.layers, ...evaluateAgentActions(p.text)];
    return { verdict: layers.length ? aggregate(layers, settings) : r.verdict, layers };
  }
  const r = await evaluate({ ...base, text: p.text, direction: "input" }, { model: ctx.model });
  const layers = [...r.layers];
  if (p.direction === "tool_result") {
    layers.push(...evaluateRetrieved(p.text, { kind: "mcp_tool_result", origin: p.origin, consumer: "tool_router" }));
  }
  return { verdict: layers.length ? aggregate(layers, settings) : r.verdict, layers };
}

export function record(p: Piece, verdict: Verdict, layers: LayerVerdict[], blocked: boolean, model?: string): Record {
  return {
    at: new Date().toISOString(),
    direction: p.direction,
    verdict,
    action: blocked ? "blocked" : "forwarded",
    model,
    origin: p.origin,
    chars: p.text.length,
    // `matched` and `spans` are left out on purpose: they are the text.
    layers: layers
      .filter((l) => l.verdict !== "allow")
      .map((l) => ({ layer: l.layer, rule: l.rule, verdict: l.verdict, reason: l.reason?.slice(0, MAX_REASON) })),
  };
}

// ---------- the proxy -----------------------------------------------------

export interface Config {
  upstream: string;
  mode: Mode;
  log: string;
  settings: PolicySettings;
  /** The provider key, if the guard is to set it. An agent that takes a
   *  127.0.0.1 address for a local model server sends a placeholder
   *  instead of its key (Hermes: `no-key-required`); then the guard has to
   *  carry the key itself. Unset: the agent's key passes through. */
  key?: string;
}

/** Paths whose bodies are scanned. Everything else passes through as is. */
const SCANNED = ["/v1/chat/completions", "/chat/completions", "/v1/messages"];

export function handler(cfg: Config, write: (r: Record) => Promise<void>) {
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    if (url.pathname === "/healthz") return new Response("ok\n");
    const target = cfg.upstream.replace(/\/$/, "") + url.pathname + url.search;
    const headers = new Headers(req.headers);
    headers.delete("host");
    headers.delete("content-length");
    const anthropic = url.pathname.endsWith("/messages");
    if (cfg.key) {
      headers.set("authorization", `Bearer ${cfg.key}`);
      if (anthropic) headers.set("x-api-key", cfg.key);
    }

    if (req.method !== "POST" || !SCANNED.includes(url.pathname)) {
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
    try {
      for (const p of newPieces(body)) {
        const { verdict, layers } = await scan(p, cfg.settings, { model });
        if (verdict === "allow") continue;
        const block = cfg.mode === "block" && verdict === "block";
        const rec = record(p, verdict, layers, block, model);
        await write(rec);
        if (block && !blockedBy) blockedBy = rec;
      }
    } catch (e) {
      console.error("guard: input scan failed, forwarding (fail-open):", e instanceof Error ? e.message : e);
    }
    if (blockedBy) return refusal(blockedBy, anthropic);

    const resp = await fetch(target, { method: "POST", headers, body: raw });
    const type = resp.headers.get("content-type") ?? "";
    if (!resp.ok || !resp.body) return relay(resp);

    if (type.includes("text/event-stream")) {
      // Stream to the agent at once; scan the copy when it has ended.
      const [toAgent, toScan] = resp.body.tee();
      scanStream(toScan, cfg, model, write);
      return relay(resp, toAgent);
    }

    const text = await resp.text();
    try {
      const answer = answerOf(JSON.parse(text));
      if (answer.text) {
        const p: Piece = { direction: "output", text: answer.text };
        const { verdict, layers } = await scan(p, cfg.settings, { model, tools: answer.tools });
        if (verdict !== "allow") {
          const block = cfg.mode === "block" && verdict === "block";
          const rec = record(p, verdict, layers, block, model);
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

async function scanStream(stream: ReadableStream<Uint8Array>, cfg: Config, model: string | undefined, write: (r: Record) => Promise<void>) {
  try {
    const c = new StreamCollector();
    const dec = new TextDecoder();
    for await (const chunk of stream) c.push(dec.decode(chunk, { stream: true }));
    const text = c.text();
    if (!text) return;
    const p: Piece = { direction: "output", text };
    const { verdict, layers } = await scan(p, cfg.settings, { model, tools: c.tools });
    if (verdict !== "allow") await write(record(p, verdict, layers, false, model));
  } catch (e) {
    console.error("guard: stream scan failed:", e instanceof Error ? e.message : e);
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
  const upstream = Deno.env.get("GUARD_UPSTREAM");
  if (!upstream) {
    console.error("GUARD_UPSTREAM is not set: the model provider's base URL, e.g. https://api.openai.com or https://openrouter.ai/api");
    Deno.exit(1);
  }
  const mode = (Deno.env.get("GUARD_MODE") ?? "flag") as Mode;
  if (mode !== "flag" && mode !== "block") {
    console.error(`GUARD_MODE must be flag or block, not ${mode}`);
    Deno.exit(1);
  }
  const cfg: Config = {
    upstream,
    mode,
    log: Deno.env.get("GUARD_LOG") ?? "/var/log/dlprevent-guard/verdicts.jsonl",
    settings: await loadSettings(Deno.env.get("GUARD_POLICY")),
    key: Deno.env.get("GUARD_UPSTREAM_KEY") || undefined,
  };
  const write = async (r: Record) => {
    console.log(`guard: ${r.direction} ${r.verdict} ${r.action} ${r.layers.map((l) => l.rule ?? l.layer).join(",")}`);
    await Deno.writeTextFile(cfg.log, JSON.stringify(r) + "\n", { append: true, create: true });
  };
  const port = Number(Deno.env.get("GUARD_PORT") ?? "8787");
  console.log(`dlprevent-guard on :${port} -> ${upstream}, mode ${mode}, log ${cfg.log}, key ${cfg.key ? "set by the guard" : "from the agent"}`);
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
