// dlprevent-guard: AnveGuard's policy engine as a self-contained proxy
// between an AI agent (Hermes) and its model provider.
//
// What is kept from upstream: the engine in supabase/functions/_shared, with
// the few changes marked `dlprevent-guard:` in it, so rule updates can be
// taken over file by file. What is not:
// Supabase, Clerk, the Lovable classifier, the dashboard, the request log.
// This proxy stores nothing but verdicts, and a verdict carries rule names
// and reasons — never the prompt, the answer or the matched text.
//
// Flow per request:
//   1. What is new since the model last spoke — the user's turn and the
//      tool results — is scanned: user text as input, tool results as
//      retrieved content (the indirect-injection route an agent is hijacked
//      through). So are the tools the agent offers the model, once each:
//      an MCP server writes their descriptions, and a poisoned one steers
//      the model on every turn.
//   2. GUARD_MODE=block refuses a request whose verdict is `block`, and
//      one it could not scan;
//      GUARD_MODE=flag (the default) forwards everything and only reports —
//      but for what is over a limit someone set (GUARD_MODELS, GUARD_RATE).
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
  evaluateBehavioral,
  evaluateRetrieved,
  hasImportantTag,
  MAX_REGEX_INPUT_LEN,
  type LayerVerdict,
  type PolicySettings,
  type Verdict,
} from "../supabase/functions/_shared/policy_engine.ts";
import { evaluateAgentActions } from "./agent_rules.ts";
import { evaluateOverrides } from "./languages.ts";

export type Mode = "flag" | "block";
export type Direction = "input" | "tool_result" | "tool_definition" | "system" | "output";

/** One scanned piece of text and where it came from. */
export interface Piece {
  direction: Direction;
  text: string;
  /** Tool name for a tool result or definition. */
  origin?: string;
  /** For an answer: the arguments of its tool calls, what it will run. */
  calls?: string;
  /** The text as the agent sent it, where `text` leaves something out for
   *  the scan (a compaction's turn labels): what a redaction is made of. */
  asSent?: string;
  /** Hermes's by its markers alone, which a person can type as well — not
   *  in a subagent's message, which its parent wrote. */
  marked?: boolean;
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
const MAX_ORIGIN = 64;

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

/** A piece and a way to replace its text in the request. `fresh`: it came
 *  after the model's last answer. */
type Slot = { piece: Piece; set: (text: string) => void; fresh?: boolean; whole?: string };

/** How deep the guard follows a nested request. Deeper is an attack on the
 *  guard's own stack, not something an agent sends. */
const MAX_DEPTH = 32;

/** Text of a content field: a string, or OpenAI/Anthropic content parts. */
export function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((p) => partText(p)).filter((s) => s.length > 0).join("\n");
}

/** Parts with nothing the guard can read: pixels, sound, a file's bytes. */
const OPAQUE = new Set(["image", "image_url", "input_image", "input_audio", "file", "input_file", "redacted_thinking"]);

/** Text of one content part. A document or a search result keeps its text
 *  elsewhere than in `text`, and a part of a type not known here is read
 *  whole: what the model can read, the guard scans. */
function partText(p: unknown, depth = 0): string {
  if (typeof p === "string") return p;
  if (!p || typeof p !== "object" || depth > MAX_DEPTH) return "";
  const part = p as Json;
  if (typeof part.text === "string") return part.text;
  // Anthropic tool_result carries its own content.
  if (part.type === "tool_result") return Array.isArray(part.content) ? part.content.map((x) => partText(x, depth + 1)).filter((s) => s).join("\n") : textOf(part.content);
  if (OPAQUE.has(part.type as string)) return "";
  return strings(part, depth).join("\n");
}

/** A part's own bookkeeping, not text for the model. */
const BOOKKEEPING = new Set(["type", "id", "tool_use_id", "media_type", "cache_control"]);

/** Every string in a part but its bookkeeping and encoded bytes. */
function strings(v: unknown, depth: number, key = ""): string[] {
  if (typeof v === "string") return BOOKKEEPING.has(key) ? [] : [v];
  if (!v || typeof v !== "object" || depth > MAX_DEPTH) return [];
  if (Array.isArray(v)) return v.flatMap((x) => strings(x, depth + 1, key));
  const o = v as Json;
  if (o.type === "base64" || o.type === "url" || o.type === "file") return []; // a PDF's bytes, a link to one
  return Object.entries(o).flatMap(([k, x]) => strings(x, depth + 1, k));
}

/**
 * The pieces a request adds since the model's last answer. Earlier turns
 * were scanned when they were new; scanning the whole history again would
 * report the same finding on every turn after it. The handler still scans
 * earlier turns it has not seen — a session older than the guard, a forged
 * turn — once each.
 *
 * Handles OpenAI chat (`role: "tool"`) and Anthropic messages (a user turn
 * whose content holds `tool_result` blocks). A role not known here is read
 * as data. The system prompt is scanned apart, see `systemSlots`; the
 * model's own answers were scanned when it gave them.
 */
export function newPieces(body: Json): Piece[] {
  return newSlots(body).filter((s) => s.fresh).map((s) => s.piece);
}

function newSlots(body: Json): Slot[] {
  const messages = messagesOf(body);
  // A subagent's task is what the model wrote into delegate_task, scanned
  // already as that model's answer. Nobody typed it.
  const system = textOf(body.system) || textOf(messages.find((m) => m.role === "system")?.content);
  const child = system.startsWith(SUBAGENT);
  const start = sinceAnswer(messages);
  const out: Slot[] = [];
  for (const [i, m] of messages.entries()) {
    const from = out.length;
    if (m.role === "user") {
      if (Array.isArray(m.content)) {
        for (const part of m.content as Json[]) {
          if (part?.type === "tool_result") {
            out.push({ piece: { direction: "tool_result", text: partText(part), origin: str(part.tool_use_id) }, set: (t) => (part.content = t) });
          } else if (typeof part?.text === "string") {
            out.push(...userSlots(part.text, (t) => (part.text = t), child));
          } else if (part && typeof part === "object") {
            // A document, a search result: handed over, not typed.
            out.push({
              piece: { direction: "tool_result", text: partText(part), origin: str(part.type) },
              set: (t) => {
                for (const k of Object.keys(part)) delete part[k];
                Object.assign(part, { type: "text", text: t });
              },
            });
          }
        }
      } else {
        out.push(...userSlots(textOf(m.content), (t) => (m.content = t), child));
      }
    } else if (m.role !== "assistant" && m.role !== "system" && m.role !== "developer") {
      // tool, the legacy function role, and whatever role comes next.
      out.push({ piece: { direction: "tool_result", text: textOf(m.content), origin: str(m.name) ?? str(m.tool_call_id) ?? str(m.role) }, set: (t) => (m.content = t) });
    }
    for (const s of out.slice(from)) s.fresh = i >= start;
  }
  return out.filter((s) => s.piece.text.trim().length > 0);
}

const messagesOf = (body: Json) => (Array.isArray(body.messages) ? body.messages : []).filter((m): m is Json => !!m && typeof m === "object");

/** Where what came after the model's last answer starts. */
function sinceAnswer(messages: Json[]): number {
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === "assistant") return i + 1;
  return 0;
}

/**
 * What is new and the guard cannot read — an image, a sound, a file's
 * bytes — counted by kind (`2 image_url, 1 document`). The model reads text
 * in a picture as well as typed text, so it is reported: it went past every
 * rule. Nobody typed it: data, like a document in `newSlots`.
 */
// ponytail: the new turns only, like `newPieces`; a session older than the
// guard has its earlier ones unreported. OCR of the pictures if one turns up
// with orders in it.
function unread(body: Json): string {
  const kinds = new Map<string, number>();
  const walk = (v: unknown, depth = 0) => {
    if (!v || typeof v !== "object" || depth > MAX_DEPTH) return;
    const t = (v as Json).type;
    // A document's source is its bytes or a link to them, see `strings`.
    const kind = typeof t === "string" && (OPAQUE.has(t) ? t : t === "base64" || t === "url" ? "document" : undefined);
    if (kind) kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
    else for (const x of Object.values(v)) walk(x, depth + 1);
  };
  const messages = messagesOf(body);
  for (const m of messages.slice(sinceAnswer(messages))) if (m.role !== "assistant") walk(m.content);
  return [...kinds].map(([k, n]) => `${n} ${k}`).join(", ");
}

/**
 * The system prompt: Anthropic's `system`, OpenAI's system and developer
 * messages. The operator's, but not only: an agent builds it from memory it
 * wrote itself and from context files in whatever repository it works in.
 * Scanned as data, once per text, like tool definitions.
 */
function systemSlots(body: Json): Slot[] {
  const out: Slot[] = [];
  if (body.system !== undefined) out.push({ piece: { direction: "system", text: textOf(body.system) }, set: (t) => (body.system = t) });
  for (const m of messagesOf(body)) {
    if (m.role === "system" || m?.role === "developer") out.push({ piece: { direction: "system", text: textOf(m.content), origin: str(m.role) }, set: (t) => (m.content = t) });
  }
  return out.filter((s) => s.piece.text.trim().length > 0);
}

/** What Hermes puts into a user message besides what the person typed: the
 *  recalled memory its memory hook appends, a skill's body up to the
 *  instruction that goes with it, a cron job's script output. */
const MEMORY_OPEN = "<memory-context>";
const MEMORY_CLOSE = "</memory-context>";
const SKILL = /\[IMPORTANT: The user has invoked the "[^"\n]+" skill/g;
const SKILL_END = "\nThe user has provided the following instruction alongside the skill invocation: ";
const SCRIPT = /## Script (?:Output|Error)\n[^\n]*\n\n```\n/g;

/**
 * The text split into what was typed and Hermes's blocks: even indices typed,
 * odd ones a block. By hand, not with one lazy regex, for two reasons:
 * - The memory block runs to the **last** closing tag. Hermes appends it at
 *   the end, and a recalled memory that contains `</memory-context>` itself
 *   must not turn the rest of it into what the person typed — which
 *   `GUARD_TRUST_USER` never refuses.
 * - Linear time. A lazy `[\s\S]*?` behind many openings with no end rescans
 *   the rest of the text from each one.
 */
export function splitHermes(text: string): string[] {
  const parts: string[] = [];
  let pos = 0;
  let scriptsLeft = true;
  const memoryEnd = text.lastIndexOf(MEMORY_CLOSE);
  for (;;) {
    const found: [number, number][] = [];
    const m = text.indexOf(MEMORY_OPEN, pos);
    if (m >= 0 && memoryEnd > m) found.push([m, memoryEnd + MEMORY_CLOSE.length]);
    SKILL.lastIndex = pos;
    const s = SKILL.exec(text);
    if (s) {
      const end = text.indexOf(SKILL_END, s.index);
      found.push([s.index, end >= 0 ? end : text.length]);
    }
    if (scriptsLeft) {
      SCRIPT.lastIndex = pos;
      const c = SCRIPT.exec(text);
      const end = c ? text.indexOf("\n```", c.index + c[0].length) : -1;
      if (c && end >= 0) found.push([c.index, end + 4]);
      // No closing fence after this one means none after any later one.
      else scriptsLeft = false;
    }
    if (found.length === 0) break;
    const [start, end] = found.reduce((a, b) => (b[0] < a[0] ? b : a));
    parts.push(text.slice(pos, start), text.slice(start, end));
    pos = end;
  }
  parts.push(text.slice(pos));
  return parts;
}

const originOf = (block: string) =>
  block.startsWith("<memory-context>") ? "memory-context" : block.startsWith("## Script") ? "cron-script" : `skill:${block.match(/"([^"]+)"/)?.[1]}`;

/** Hermes's context compression: the old turns, sent back as one user
 *  message, each behind a label of its own (agent/context_compressor.py). */
const COMPACTION = "You are a summarization agent creating a context checkpoint.";
const TURN_LABEL = /(^|\n)\[(?:[A-Z_]+|TOOL RESULT [^\]\n]*)\]:/g;

/** How Hermes opens a subagent's system prompt (tools/delegate_tool_progress.py). */
const SUBAGENT = "You are a focused subagent working on a specific delegated task.";

/** How Hermes opens a cron job's prompt (cron/scheduler_prompt.py). */
const CRON = "[IMPORTANT: You are running as a scheduled cron job.";

/**
 * A user message, split into what the person typed and what Hermes adds to
 * it. What Hermes adds is data, like a tool result: recalled memory's IDs
 * and `--- head ---` markers, a skill's HTML template, a script's hashes all
 * came back as `adversarial_suffix`, and a compaction's `[ASSISTANT]:`
 * labels as `pseudo_role_tag`. A poisoned one stays an injection finding.
 */
function userSlots(text: string, write: (text: string) => void, child = false): Slot[] {
  if (text.startsWith(COMPACTION)) {
    // Scanned without the labels; everything in it was scanned when it was new.
    return [{ piece: { direction: "tool_result", text: text.replace(TURN_LABEL, "$1"), origin: "compaction", marked: !child, asSent: text }, set: write }];
  }
  // Odd indices are Hermes's blocks, even ones what the person typed.
  const parts = splitHermes(text);
  const put = (i: number, t: string) => {
    parts[i] = t;
    write(parts.join(""));
  };
  const typed = parts.filter((_, i) => i % 2 === 0).join("");
  // In a cron run nobody typed anything: what is left is the job's prompt,
  // stored when the job was made. In a subagent it is the task its parent
  // wrote. The briefing's shell line, its placeholders and table came back as
  // `adversarial_suffix`, in the job and in its reviewer, every day.
  const from = typed.includes(CRON) ? "cron-job" : child ? "delegate_task" : undefined;
  const out: Slot[] = [{
    // A cron job's marker is in the text; a subagent's is in the system prompt, which nobody types.
    piece: from ? { direction: "tool_result", text: typed, origin: from, marked: !child } : { direction: "input", text: typed },
    set: (t: string) => {
      for (let i = 2; i < parts.length; i += 2) parts[i] = "";
      put(0, t);
    },
  }];
  for (let i = 1; i < parts.length; i += 2) {
    out.push({ piece: { direction: "tool_result", text: parts[i], origin: originOf(parts[i]), marked: !child }, set: (t) => put(i, t) });
  }
  return out;
}

/**
 * The tools the agent offers the model, one slot per tool: its description
 * and every description in its parameters. Not the operator's: whoever
 * wrote the MCP server wrote these, and the model reads them as guidance on
 * every turn (tool poisoning, OWASP ASI04).
 */
function toolSlots(body: Json): Slot[] {
  const out: Slot[] = [];
  for (const t of (Array.isArray(body.tools) ? body.tools : []) as Json[]) {
    const def = (t?.function as Json | undefined) ?? t; // OpenAI nests it
    if (!def || typeof def !== "object") continue;
    const params = described(def.parameters ?? def.input_schema);
    const text = [def, ...params].map((h) => str(h.description)).filter((d) => d !== undefined).join("\n");
    out.push({
      piece: { direction: "tool_definition", text, origin: str(def.name) },
      whole: JSON.stringify(def),
      set: (x) => {
        def.description = x;
        for (const h of params) delete h.description;
      },
    });
  }
  return out;
}

/** The objects in a JSON schema that carry a `description`. */
function described(v: unknown, out: Json[] = [], depth = 0): Json[] {
  if (depth > MAX_DEPTH) return out;
  if (Array.isArray(v)) for (const x of v) described(x, out, depth + 1);
  else if (v && typeof v === "object") {
    if (typeof (v as Json).description === "string") out.push(v as Json);
    for (const x of Object.values(v)) described(x, out, depth + 1);
  }
  return out;
}

/** What the model gets in place of a piece that was refused before. */
const withheld = (why: string) => `[withheld by dlprevent-guard: this content was refused earlier (${why}). Tell the user it was blocked; do not try to fetch it again.]`;

/** What the model gets in place of a refused tool description or system prompt. */
const withheldDef = (p: Piece, why: string) =>
  p.direction === "system"
    ? `[withheld by dlprevent-guard: the system prompt was refused (${why}). Tell the user it was blocked.]`
    : `[withheld by dlprevent-guard: this tool's description was refused (${why}). Do not use this tool; tell the user it was blocked.]`;

/** Refused pieces by hash, with the rules that refused them. The agent keeps
 *  a refused tool result or message in its history and sends it again with
 *  every later turn; refusing it again would end the session for good. From
 *  the second time on it is replaced, and the rest goes through. */
// ponytail: in memory, cleared when full or on restart — then the stuck
// piece is refused once more and remembered again.
const MAX_REFUSED = 10_000;

/** A piece's key in the guard's memory: what it is and where it came from,
 *  not only its text — the same words typed by the user are not the tool
 *  result that was refused. */
async function digest(p: Piece): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${p.direction}\0${p.origin ?? ""}\0${p.text}`));
  return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The model's answer as text, and the tools it asks for — from a complete
 *  (non-streamed) OpenAI or Anthropic response. Tool arguments count as
 *  text: they are where an exfiltration URL or a shell command sits. */
export function answerOf(resp: Json): { text: string; calls: string; tools: string[] } {
  const prose: string[] = [];
  const calls: string[] = [];
  const tools: string[] = [];
  // Every choice (`n` > 1), and the legacy `function_call` beside `tool_calls`.
  for (const choice of (Array.isArray(resp.choices) ? resp.choices : []) as Json[]) {
    const msg = choice?.message as Json | undefined;
    if (!msg) continue;
    prose.push(textOf(msg.content));
    for (const f of [...((msg.tool_calls as Json[] | undefined) ?? []).map((tc) => tc.function as Json | undefined), msg.function_call as Json | undefined]) {
      if (str(f?.name)) tools.push(str(f?.name)!);
      if (args(f?.arguments)) calls.push(args(f?.arguments)!);
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
 * An event may span several `data:` lines (joined with a newline, as the
 * SSE spec says); data that never parses is scanned as it is, not dropped.
 */
export class StreamCollector {
  private rest = "";
  private data: string[] = [];
  private parts: string[] = [];
  private callParts: string[] = [];
  tools: string[] = [];

  push(chunk: string) {
    // The SSE spec ends a line with CRLF, LF or a lone CR.
    const lines = (this.rest + chunk).split(/\r\n|\r|\n/);
    this.rest = lines.pop() ?? "";
    for (const line of lines) this.line(line.trim());
  }

  private line(line: string) {
    if (line === "") return this.end();
    if (!line.startsWith("data:")) return;
    this.data.push(line.slice(5).trim());
    const data = this.data.join("\n");
    if (data === "" || data === "[DONE]") return void (this.data = []);
    let ev: Json;
    try {
      ev = JSON.parse(data);
    } catch {
      return; // the rest of the event may follow on the next data: line
    }
    this.data = [];
    for (const choice of (Array.isArray(ev.choices) ? ev.choices : []) as Json[]) {
      const delta = choice?.delta as Json | undefined;
      if (!delta) continue;
      if (str(delta.content)) this.parts.push(str(delta.content)!);
      for (const f of [...((delta.tool_calls as Json[] | undefined) ?? []).map((tc) => tc.function as Json | undefined), delta.function_call as Json | undefined]) {
        if (str(f?.name)) this.tools.push(str(f?.name)!);
        if (args(f?.arguments)) this.call(args(f?.arguments)!);
      }
    }
    const d = ev.delta as Json | undefined;
    if (ev.type === "content_block_delta" && d) {
      if (str(d.text)) this.parts.push(str(d.text)!);
      if (str(d.partial_json)) this.call(str(d.partial_json)!);
    }
    const block = ev.content_block as Json | undefined;
    if (ev.type === "content_block_start" && block?.type === "tool_use") {
      if (str(block.name)) this.tools.push(str(block.name)!);
      // The Anthropic SDK may send the whole input here instead of as deltas.
      if (block.input && typeof block.input === "object" && Object.keys(block.input).length > 0) this.call(JSON.stringify(block.input));
    }
  }

  private call(s: string) {
    this.parts.push(s);
    this.callParts.push(s);
  }

  /** An event that ended without parsing: scanned raw, as a call. */
  private end() {
    const data = this.data.join("\n");
    this.data = [];
    if (data.trim()) this.call(data);
  }

  text(): string {
    if (this.rest) this.line(this.rest.trim());
    this.rest = "";
    this.end();
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

/** Tool-call arguments: a JSON string, or — from some gateways — an object. */
function args(v: unknown): string | undefined {
  return v && typeof v === "object" ? JSON.stringify(v) : str(v);
}

// ---------- judging -------------------------------------------------------

type Turn = { role: string; content: string };

/** How many typed turns upstream's multi-turn rules look back. */
const TURNS = 12;

/** What a scan says of a piece: `sanitized` with the verdict `sanitize`,
 *  the text to send on in the piece's place. */
type Scanned = { verdict: Verdict; layers: LayerVerdict[]; sanitized?: string };

/** What a scan knows of the request besides the piece itself. */
interface Context {
  model?: string;
  /** The tools an answer calls. */
  tools?: string[];
  uploadHosts?: string[];
  /** `GUARD_TRUST_USER`: what Hermes's markers enclose is Hermes's. */
  trustUser?: boolean;
  /** The request's system prompt, for an answer that recites it. */
  system?: string;
  /** For the newest turn a person typed: that turn and the ones before it,
   *  oldest first. A persona or a frame built up over several turns is in
   *  none of them alone. */
  typed?: Turn[];
}

/** Scan one piece. Tool results go through the retrieved-content scanner
 *  on top of the ordinary input scan: instructions hidden in a web page or
 *  a file are the injection an agent actually falls for. */
export async function scan(p: Piece, settings: PolicySettings, ctx: Context = {}): Promise<Scanned> {
  // Upstream's role-tag rules, `(^|\n)\s*…`, start at every line and read
  // all the blank space after it: 400 KB of empty lines held the guard for
  // minutes, every other request with it. A long run of blank space is read
  // as a shorter one; it says nothing more. A piece masked in block mode goes
  // on with it shortened too.
  p = { ...p, text: squeeze(p.text), asSent: p.asSent === undefined ? undefined : squeeze(p.asSent) };
  const base = {
    legacy: { blocked_keywords: [], allowed_keywords: [], use_global_defaults: false },
    rules: [],
    intents: [],
    settings,
  };
  if (p.direction === "output") {
    const r = await evaluate({ ...base, text: p.text, direction: "output" }, { model: ctx.model, responseToolNames: ctx.tools });
    // An agent on a server talks to 127.0.0.1, localhost and its Docker
    // network all day; upstream blocks every private address it names, and
    // "check the service on 127.0.0.1:8080" was refused. Reported, not
    // refused — except the cloud metadata address, where a hijacked agent
    // picks up the machine's credentials.
    // And an answer is not rewritten — it is JSON or a stream, and what the
    // engine redacts is prose and tool calls run together: `sanitize` is a
    // report here, and the log says so.
    const own = r.layers.map((l) => (l.rule === "egress_private_ip" && !METADATA.test(l.matched ?? "")) || l.verdict === "sanitize" ? { ...l, verdict: "flag" as Verdict } : l);
    // The system prompt, word for word, in the answer (OWASP LLM07). Not
    // refused: an agent's system prompt holds its memory and its context
    // files, and it quotes those all day. Off with the engine's heuristics.
    if (settings.enable_heuristics && ctx.system && recites(p.text, ctx.system)) {
      own.push({ layer: "heuristics", rule: "system_prompt_leak", verdict: "flag", reason: "Output contains a verbatim slice of the system prompt." });
    }
    // What the agent is about to do: upstream judges text, not commands.
    const acts = evaluateAgentActions(p.text, p.calls ?? "", ctx.uploadHosts);
    // A chat client fetches an image the moment it shows the answer: data in
    // its address leaves without a click (EchoLeak). `agent_markdown_exfil`
    // refuses 40 characters of data or more; a name or a short key is less.
    // ponytail: inline images only — a link's preview fetches too, in some
    // chats, and a reference-style image `![x][1]` is not read.
    if (settings.enable_egress_filter && !acts.some((l) => l.rule === "agent_markdown_exfil") && IMAGE_QUERY.test(p.text)) {
      own.push({ layer: "egress", rule: "markdown_image_query", verdict: "flag", reason: "Output shows an image whose address carries a query: what is in it leaves when the image loads." });
    }
    const layers = [...own, ...acts];
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
  // A tool definition is data too, and its example addresses and IDs are
  // not a leak.
  const tool = p.direction !== "input";
  // A system prompt is instructions by nature, like a tool description.
  const def = p.direction === "tool_definition" || p.direction === "system";
  const s = tool ? { ...settings, enable_heuristics: false, enable_behavioral: false, ...(def ? { enable_pii_detection: false } : {}) } : settings;
  const r = await evaluate({ ...base, settings: ctx.typed ? withoutStanding(s, ctx.typed) : s, text: p.text, direction: "input", conversation: ctx.typed }, { model: ctx.model });
  // "may not delete memory entries", "delete the context folder": in data,
  // housekeeping on memory and context, not an order to forget instructions.
  // "ASX 200 closes higher in Sydney" was refused as a jailbreak persona. A
  // city, a first name, a word in capitals: when that is all the persona
  // rule found, it found none. "DAN 11.0", "BetterDAN" still count.
  // Reported, not refused: a reading that may be harmless still reaches the
  // log — a filter that drops it would make a bypass invisible.
  const only = (l: LayerVerdict, rule: string, re: RegExp) => l.rule === rule && l.spans?.every((s) => re.test(s.match.trim()));
  /** The exceptions above, for upstream's layers and for ours alike. */
  const tame = (ls: LayerVerdict[]) =>
    ls
      .filter((l) => !only(l, "modern_jailbreak_persona", ORDINARY_NAME))
      .map((l) => tool && only(l, "ignore_prior_instructions", HOUSEKEEPING) ? soften(l) : l);
  // The trained classifier in shadow mode says `allow`, and an `allow` never
  // reaches the log: what shadow mode is for went unseen. A report here.
  const kept = tame(r.layers).map((l) => l.rule === "trained_classifier" && l.verdict === "allow" ? { ...l, verdict: "flag" as Verdict } : l);
  const layers = [...kept];
  // The languages upstream does not read, and letters spaced out to slip
  // past either list, with upstream's action for an injection. Nothing to
  // redact here, so `sanitize` refuses, as upstream does without spans. Left
  // out only where the same rule already says as much: an English sentence
  // read as housekeeping must not take a German order down to a report.
  if (settings.enable_injection_guard !== false) {
    const name = (l: LayerVerdict) => l.rule?.replace(/:normalized$/, "");
    const verdict: Verdict = settings.injection_action === "flag" ? "flag" : "block";
    for (const l of tame(evaluateOverrides(p.text).map((l) => ({ ...l, verdict })))) {
      if (!layers.some((k) => name(k) === name(l) && (k.verdict === "block" || k.verdict === l.verdict))) layers.push(l);
    }
  }
  // Hermes's markers a person can type too, and between them a prompt was
  // read as data: text turned around with direction overrides went through
  // as `allow`. So where the person is not trusted, what the markers enclose
  // is checked for those.
  // ponytail: these characters only. Upstream's heuristics for hidden
  // characters took `10 kΩ`, a Cyrillic name, an emoji and a phone number's
  // direction mark for an attack, its others a hash and a script's output:
  // a gibberish suffix or look-alike letters between markers still pass.
  if (p.marked && !ctx.trustUser && settings.enable_heuristics && REORDERS.test(p.text)) {
    layers.push({ layer: "heuristics", rule: "bidi_smuggling", verdict: "block", reason: "Direction overrides that show text in another order than it is read" });
  }
  if (tool) {
    let found = evaluateRetrieved(p.text, { kind: p.direction === "tool_definition" ? "mcp_tool_desc" : "mcp_tool_result", origin: p.origin, consumer: "tool_router" });
    // "You must read a file before editing it" is what a tool description
    // is for: of six ordinary ones, three came back as an imperative to the
    // model. Only the <IMPORTANT>…</IMPORTANT> form of it stays a finding;
    // the poisoned descriptions tried were caught by other rules as well.
    // A tool result is no different: a web page on babies and screens said
    // "you should turn the TV off" to its reader and was refused. It is
    // still reported: a page need not wrap its orders in a tag.
    const tagged = hasImportantTag(p.text);
    if (def && !tagged) found = found.filter((l) => l.rule !== "retrieved_imperative_to_model");
    // A search for running shoes on galaxus.ch was refused: the shop's
    // product images sit on hosts no allowlist knows. A fixed image URL in a
    // page carries only what its author already had; it leaks the
    // conversation only with a placeholder for the model to fill in — or a
    // path its author wrote for it, so it is reported.
    const templated = TEMPLATED_IMAGE.test(p.text);
    found = found.map((l) =>
      (l.rule === "retrieved_imperative_to_model" && !tagged) || (l.rule === "retrieved_markdown_image_exfil" && !templated) ? soften(l) : l
    );
    layers.push(...found);
  }
  // The verdict is the kept layers': upstream's counts what was filtered out.
  const verdict = layers.length || tool || kept.length < r.layers.length ? aggregate(layers, settings) : r.verdict;
  if (verdict !== "sanitize") return { verdict, layers };
  // What goes on in the piece's place: the engine's own redaction — of the
  // text as the agent sent it, where the scan read it without its labels.
  // With nothing to send on in its place, the piece is refused.
  const sanitized = p.asSent === undefined ? r.sanitized_text : (await evaluate({ ...base, settings: s, text: p.asSent, direction: "input" }, { model: ctx.model })).sanitized_text;
  return sanitized === undefined ? { verdict: "block", layers } : { verdict, layers, sanitized };
}

/** Whether the answer holds 60 characters of the system prompt word for
 *  word. Upstream's `system_prompt_leak` test, which `evaluate` runs only
 *  when given the prompt — and then its risk-trio rule takes every agent for
 *  a privileged one and refuses a warning that names an attack and its URL.
 *  One lookup per character here, where upstream searches the answer once
 *  per slice: a long system prompt and a long answer took seconds. */
function recites(answer: string, system: string): boolean {
  const slices = new Set<string>();
  for (let i = 0; i + 60 <= system.length; i += 20) slices.add(system.slice(i, i + 60));
  for (let i = 0; i + 60 <= answer.length; i++) if (slices.has(answer.slice(i, i + 60))) return true;
  return false;
}

/**
 * The settings under which upstream's multi-turn rules name only what this
 * turn brings. A persona that keeps coming back, or instructions flipped
 * back and forth, stay a pattern on every turn after the one that completed
 * it, and upstream stops at the first pattern it finds: as it stands, the
 * same finding came with every later turn, and a primed request or a sudden
 * long turn behind it came with none. So a pattern that holds with this
 * turn left blank is put out of reach. Only these two can — the other rules
 * read this turn's own words.
 */
function withoutStanding(settings: PolicySettings, typed: Turn[]): PolicySettings {
  const s = { ...settings };
  const blank = [...typed.slice(0, -1), { role: "user", content: "." }];
  for (;;) {
    // The thresholds as `evaluate` hands them over.
    const rule = evaluateBehavioral(blank, {
      churn: s.behavioral_churn_threshold,
      persona: s.behavioral_persona_threshold,
      encodingStep: s.behavioral_encoding_ratio_step,
      lengthMultiplier: s.behavioral_length_multiplier,
    })[0]?.rule;
    if (rule === "instruction_churn" && s.behavioral_churn_threshold !== Infinity) s.behavioral_churn_threshold = Infinity;
    else if (rule === "roleplay_escalation" && s.behavioral_persona_threshold !== Infinity) s.behavioral_persona_threshold = Infinity;
    else return s;
  }
}

/** A block that may be a false positive: reported, never refused. */
const soften = (l: LayerVerdict): LayerVerdict => l.verdict === "block" ? { ...l, verdict: "flag" } : l;

/** What the guard could not scan. A `block`: in block mode nothing passes
 *  unread — whoever can make a scan throw would otherwise have a way past
 *  every rule (pentest 11c3/vuln-0004). Flag mode forwards it like any other. */
const FAILED: LayerVerdict = { layer: "patterns", rule: "guard_scan_failed", verdict: "block", reason: "The guard could not scan this" };

/** A tool definition other than the one let through before under its name.
 *  Reported, not refused: an agent's own tools change with an update, and
 *  the new text is scanned like any other. */
const CHANGED: LayerVerdict = { layer: "tool_governance", rule: "tool_definition_changed", verdict: "flag", reason: "This tool's definition changed since the guard let it through" };

/** The record of a scan that threw outside any one piece. */
const failure = (direction: Direction, blocked: boolean, model?: string, upstream?: string): Record => record({ direction, text: "" }, "block", [FAILED], blocked, model, upstream);

/** `scan`, but a piece the guard cannot scan is a finding, not waved
 *  through — and the rest of the request is still scanned. */
async function judge(p: Piece, settings: PolicySettings, ctx: Context = {}): Promise<Scanned> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  // A classifier that takes the request and never answers would hold every
  // request after it: upstream's call to it has no time limit.
  const late = new Promise<never>((_, fail) => timer = setTimeout(() => fail(new Error(`no verdict after ${SCAN_TIMEOUT} ms`)), SCAN_TIMEOUT));
  try {
    return await Promise.race([scan(p, settings, ctx), late]);
  } catch (e) {
    console.error(`guard: ${p.direction} not scanned:`, e instanceof Error ? e.message : e);
    return { verdict: "block", layers: [FAILED] };
  } finally {
    clearTimeout(timer);
  }
}

/** How long one piece's scan may take. The rules take milliseconds; the
 *  trained classifier on a CPU a few hundred. */
const SCAN_TIMEOUT = 5_000;

const METADATA = /^(?:169\.254\.|fd00:ec2::254$|metadata\.google\.internal$)/i;

/** Characters that show text in another order than it is read: the
 *  overrides and isolates, not the plain direction marks a phone number or
 *  an Arabic name carries. */
const REORDERS = /[\u202A-\u202E\u2066-\u2069]/;

const ORDINARY_NAME = /^(?:Sydney|STAN|DUDE|Cody|Machiavelli)$/;

const HOUSEKEEPING = /^(?:delete|drop|erase|wipe|skip|override)\b[\s\S]*\b(?:context|memory)$/i;

/** Blank space past 100 characters, read as 100: see `scan`. */
const squeeze = (t: string) => t.replace(/\s{101,}/g, (m) => m.slice(0, 100));

// Bounded repeats: with `[^)]*`, many `![](` openings and no `)` rescan the
// rest of the text from each one.
const IMAGE_QUERY = /!\[[^[\]\n]{0,1000}\]\(\s{0,10}<?https?:\/\/[^\s()?#<>]{1,2000}\?[^\s()#]/i;
const TEMPLATED_IMAGE =/!\[[^[\]\n]{0,1000}\]\([^()\n]{0,2000}?(?:\{\{[^}]{1,200}\}\}|\$\{[^}]{1,200}\}|\[(?:INSERT|DATA|LEAK|CONVERSATION|MESSAGES?|SECRETS?|CONTEXT|HISTORY)[_A-Z]{0,50}\])/i;
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
    // A tool name comes from whoever wrote the MCP server: a name, not text.
    origin: p.origin?.replace(/[^\w.:@\/+-]/g, "_").slice(0, MAX_ORIGIN),
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
  /** In block mode, only report what the user typed and the system prompt,
   *  never refuse them (`GUARD_TRUST_USER`). For an agent only its owner
   *  talks to: the owner is not who the guard is for, what reaches the agent
   *  from outside is. */
  trustUser?: boolean;
  /** Hosts an agent may upload files to (`GUARD_UPLOAD_HOSTS`), besides
   *  loopback: an upload there is reported, not refused. `*.x.ch` for the
   *  subdomains of x.ch. */
  uploadHosts?: string[];
  log: string;
  settings: PolicySettings;
  /** What an agent may spend (OWASP LLM10). Kept in both modes: a limit
   *  someone set is not a guess that may be wrong. */
  limits?: Limits;
}

export interface Limits {
  /** `GUARD_MODELS`: the models an agent may ask for; `deepseek-*` for every
   *  name that starts with `deepseek-`. */
  models?: string[];
  /** `GUARD_MAX_TOKENS`: the most output one answer may ask for. A larger
   *  `max_tokens` or `max_completion_tokens` is lowered to it. */
  maxTokens?: number;
  /** `GUARD_RATE`: requests per minute, for the whole guard. */
  perMinute?: number;
}

const overLimit = (rule: string, reason: string): LayerVerdict => ({ layer: "patterns", rule, verdict: "block", reason });

const allowed = (model: string | undefined, list: string[]) =>
  model !== undefined && list.some((m) => (m.endsWith("*") ? model.startsWith(m.slice(0, -1)) : model === m));

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
    // `a-b` and `a_b` would read the same key variable: one provider's key
    // would go to the other.
    const variable = `GUARD_KEY_${name.toUpperCase().replace(/-/g, "_")}`;
    const twin = Object.keys(out).find((n) => `GUARD_KEY_${n.toUpperCase().replace(/-/g, "_")}` === variable);
    if (twin) throw new Error(`GUARD_UPSTREAMS: "${twin}" and "${name}" would share ${variable}; name them apart`);
    const key = env[variable];
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

/** Other endpoints that make the model answer: the Responses API, legacy
 *  completions, batches. Not scanned, so block mode refuses them instead of
 *  letting them past. */
const UNSCANNED_MODEL = /\/(?:responses|completions|batches)(?:\/|$)/;

/** A path as the provider will read it: `//`, a trailing `/` and `%2F`
 *  must not step around `SCANNED`. */
export function normalPath(path: string): string {
  let p = path;
  try {
    p = decodeURIComponent(path);
  } catch { /* stays as it came */ }
  return p.replace(/\/{2,}/g, "/").replace(/(.)\/+$/, "$1");
}

/** The most the guard reads of one request. Far above a long agent context;
 *  what is larger is refused in block mode, not read into memory. */
// ponytail: one fixed cap; a setting if an agent ever sends more.
const MAX_BODY = 32 * 1024 * 1024;

/** The body as text, or undefined when it is larger than `MAX_BODY`. */
async function readCapped(req: Request): Promise<string | undefined> {
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return undefined;
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const c of req.body ?? []) {
    size += c.length;
    if (size > MAX_BODY) return undefined;
    chunks.push(c);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.length;
  }
  return new TextDecoder().decode(all);
}

/** Refused before scanning: what the guard cannot read cannot pass in block mode. */
function unscannable(message: string, anthropic: boolean, status = 403): Response {
  const body = anthropic
    ? { type: "error", error: { type: "permission_error", message: `dlprevent-guard: ${message}` } }
    : { error: { message: `dlprevent-guard: ${message}`, type: "guard_blocked", code: "not_scanned" } };
  return Response.json(body, { status });
}

export function handler(cfg: Config, writeLog: (r: Record) => Promise<void>) {
  const refused = new Map<string, string>();
  /** Tool definitions and system prompts by hash: "" when scanned and let
   *  through, the rules when refused. The agent sends them with every
   *  request; a finding is reported once, not on every turn. */
  const tools = new Map<string, string>();
  /** Conversation pieces scanned and let through, by hash. */
  const seen = new Set<string>();
  /** Pieces redacted before, by hash. The agent keeps the text as it was and
   *  sends it with every later turn: reported once, redacted each time. The
   *  guard keeps no text to put in its place, so such a piece is judged
   *  again with every request. */
  const masked = new Set<string>();
  /** Each tool's definition by name, as last seen: a server that rewrites
   *  one after it was let through is reported (OWASP ASI04, the rug pull). */
  // ponytail: in memory like `refused` — a definition changed across a
  // restart, or after the map was cleared when full, is not seen.
  const defs = new Map<string, string>();
  // ponytail: one fixed window for the whole guard, the minute on the clock —
  // up to twice the rate across a minute's turn; per route if one agent
  // starves another.
  let minute = 0;
  let used = 0;
  // A log that cannot be written must not decide what is refused.
  const write = async (r: Record) => {
    try {
      await writeLog(r);
    } catch (e) {
      console.error("guard: verdict log not written:", e instanceof Error ? e.message : e);
    }
  };
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    if (url.pathname === "/healthz") return new Response("ok\n");
    // An agent sends no Origin; a browser does, on every POST. Without this
    // a web page open on the same machine could spend the provider key the
    // guard carries, through 127.0.0.1 or a rebound DNS name.
    if (req.headers.has("origin")) return Response.json({ error: { message: "dlprevent-guard: requests from a browser are refused", type: "guard_forbidden" } }, { status: 403 });
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

    const perMinute = cfg.limits?.perMinute;
    if (perMinute && req.method === "POST") {
      const now = Math.floor(Date.now() / 60_000);
      if (now !== minute) [minute, used] = [now, 0];
      if (++used > perMinute) {
        // Once a minute: an agent retrying would fill the log.
        if (used === perMinute + 1) await write(record({ direction: "input", text: "" }, "block", [overLimit("rate_limited", `More than ${perMinute} requests in a minute (GUARD_RATE)`)], true, undefined, to.name));
        return limited(anthropic, 60 - Math.floor(Date.now() / 1000) % 60);
      }
    }

    const block = cfg.mode === "block";
    // A limit holds in both modes, and what the guard cannot read it cannot
    // check against one either.
    const strict = block || !!(cfg.limits?.models || cfg.limits?.maxTokens);
    const path = normalPath(to.path);
    if (req.method !== "POST" || !SCANNED.includes(path)) {
      if (strict && req.method === "POST" && UNSCANNED_MODEL.test(path)) {
        return unscannable(`${path} is not scanned; use /v1/chat/completions or /v1/messages`, anthropic);
      }
      return relay(await fetch(target, { method: req.method, headers, body: req.body, redirect: "manual" }));
    }
    // A compressed body reads as garbage; in block mode it is not let past.
    const encoded = (req.headers.get("content-encoding") ?? "identity").toLowerCase() !== "identity";
    if (strict && encoded) return unscannable("a compressed request body cannot be scanned", anthropic);

    const raw = await readCapped(req);
    if (raw === undefined) {
      if (block) return unscannable(`request body larger than ${MAX_BODY} bytes`, anthropic, 413);
      console.error("guard: request body too large to scan, refused");
      return Response.json({ error: { message: "dlprevent-guard: request body too large", type: "guard_too_large" } }, { status: 413 });
    }
    let body: Json;
    try {
      body = JSON.parse(raw);
    } catch {
      // The provider may read what JSON.parse does not (`NaN`, for one).
      if (strict) return unscannable("the request body is not JSON the guard can read", anthropic, 400);
      console.error("guard: request body not JSON, forwarded unscanned");
      return relay(await fetch(target, { method: "POST", headers, body: raw, redirect: "manual" }));
    }
    const model = str(body.model);
    const models = cfg.limits?.models;
    // OpenRouter falls back to the models in `models`.
    const asked = [body.model, ...(Array.isArray(body.models) ? body.models : [])].map(str);
    const wrong = asked.findIndex((m) => !allowed(m, models ?? []));
    if (models && wrong >= 0) {
      const rec = record({ direction: "input", text: "" }, "block", [overLimit("model_not_allowed", `${asked[wrong] ?? "No model"} is not in GUARD_MODELS`)], true, model, to.name);
      await write(rec);
      return refusal(rec, anthropic);
    }
    const most = cfg.limits?.maxTokens;
    for (const k of ["max_tokens", "max_completion_tokens"]) {
      if (most && typeof body[k] === "number" && body[k] > most) {
        body[k] = most;
      }
    }

    // A guard that throws: flag mode forwards, so it does not take the agent
    // down with it; block mode refuses, so it is not a way past the guard.
    let blockedBy: Record | undefined;
    /** The system prompt as the agent sent it, for the answer's scan. */
    let system: string | undefined;
    try {
      const prompts = systemSlots(body);
      system = prompts.map((s) => s.piece.text).join("\n");
      for (const { piece: p, set, whole } of [...prompts, ...toolSlots(body)]) {
        // The whole definition: a parameter added without a word of
        // description (`bcc`, its default an address) changes it too.
        if (whole !== undefined && p.origin) {
          const now = await digest({ ...p, text: whole });
          const before = defs.get(p.origin);
          if (defs.size >= MAX_REFUSED) defs.clear();
          defs.set(p.origin, now);
          if (before !== undefined && before !== now) await write(record(p, "flag", [CHANGED], false, model, to.name));
        }
        if (!p.text.trim()) continue;
        const hash = await digest(p);
        let why = tools.get(hash);
        if (why === undefined) {
          why = "";
          const { verdict, layers, sanitized } = await judge(p, cfg.settings, { model });
          const redact = block && sanitized !== undefined;
          if (verdict !== "allow" && !(redact && masked.has(hash))) {
            const refuse = block && verdict === "block" && !(cfg.trustUser && p.direction === "system");
            const rec = record(p, verdict, layers, refuse, model, to.name);
            await write(rec);
            if (refuse) why = rec.layers.map((l) => l.rule ?? l.layer).join(", ");
          }
          if (block && sanitized !== undefined) {
            if (masked.size >= MAX_REFUSED) masked.clear();
            masked.add(hash);
            set(sanitized);
            continue;
          }
          // ponytail: same bound and restart behaviour as `refused`.
          if (tools.size >= MAX_REFUSED) tools.clear();
          tools.set(hash, why);
        }
        // Not refused: the request goes on without the description, so the
        // agent keeps working and the model is told to leave the tool alone.
        if (why) {
          set(withheldDef(p, why));
        }
      }
            const slots = newSlots(body);
      // Once per request, the last few turns, each cut short: handed to every
      // turn whole, 16 000 short ones held the guard for five seconds.
      const typed = slots.filter((s) => s.piece.direction === "input").slice(-TURNS);
      const turns = typed.map((s) => ({ role: "user", content: s.piece.text.slice(0, MAX_REGEX_INPUT_LEN) }));
      for (const { piece: p, set, fresh } of slots) {
        const hash = await digest(p);
        const why = refused.get(hash);
        if (why !== undefined) {
          set(withheld(why));
          console.log(`guard: ${p.direction} withheld, refused before: ${why}`);
          continue;
        }
        if (!fresh && seen.has(hash)) continue;
        const { verdict, layers, sanitized } = await judge(p, cfg.settings, { model, trustUser: cfg.trustUser, typed: p === typed.at(-1)?.piece ? turns : undefined });
        // ponytail: same bound and restart behaviour as `refused`.
        if (block && sanitized !== undefined) {
          set(sanitized);
          if (masked.has(hash)) continue;
          if (masked.size >= MAX_REFUSED) masked.clear();
          masked.add(hash);
        } else {
          if (seen.size >= MAX_REFUSED) seen.clear();
          seen.add(hash);
        }
        if (verdict === "allow") continue;
        const refuse = block && verdict === "block" && !(cfg.trustUser && p.direction === "input");
        const rec = record(p, verdict, layers, refuse, model, to.name);
        await write(rec);
        if (!refuse) continue;
        if (refused.size >= MAX_REFUSED) refused.clear();
        refused.set(hash, rec.layers.map((l) => l.rule ?? l.layer).join(", "));
        blockedBy ??= rec;
      }
      const what = unread(body);
      if (what) await write(record({ direction: "tool_result", text: "" }, "flag", [{ layer: "patterns", rule: "unscanned_content", verdict: "flag", reason: `Not scanned: ${what}` }], false, model, to.name));
    } catch (e) {
      console.error(`guard: input scan failed, ${block ? "refused" : "forwarding"}:`, e instanceof Error ? e.message : e);
      const rec = failure("input", block, model, to.name);
      await write(rec);
      if (block) blockedBy ??= rec;
    }
    if (blockedBy) return refusal(blockedBy, anthropic);

    // A redirect goes back to the agent as it is: the guard talks to the
    // configured provider and nowhere else, not to where it points.
    // The body as the guard read it, never the raw one: with a key twice in
    // it, the guard reads the last and a provider may read the first.
    const resp = await fetch(target, { method: "POST", headers, body: JSON.stringify(body), redirect: "manual" });
    const type = resp.headers.get("content-type") ?? "";
    if (!resp.ok || !resp.body) return relay(resp);

    if (type.includes("text/event-stream")) {
      if (cfg.mode === "flag") {
        // Stream to the agent at once; scan the copy when it has ended.
        const [toAgent, toScan] = resp.body.tee();
        scanStream(toScan, cfg, { model, system }, to.name, write);
        return relay(resp, toAgent);
      }
      // Block mode: a command can only be stopped before the agent has it.
      // On the Hermes host every answer came streamed, and a tool call on a
      // key file went through as `block forwarded`. So the whole stream is
      // held, scanned, and then passed on in one piece or refused.
      const sse = await resp.text();
      const rec = await scanSse(sse, cfg, { model, system }, to.name, write, true);
      if (rec?.action === "blocked") return refusal(rec, anthropic);
      return relay(resp, sse);
    }

    const text = await resp.text();
    let parsed: Json | undefined;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = undefined;
    }
    if (parsed === undefined) {
      // A stream under another content type is still a stream.
      if (/^data:/m.test(text)) {
        const rec = await scanSse(text, cfg, { model, system }, to.name, write, true);
        if (rec?.action === "blocked") return refusal(rec, anthropic);
        return relay(resp, text);
      }
      if (block) return unscannable("the provider's answer is not JSON the guard can read", anthropic, 502);
      return relay(resp, text);
    }
    try {
      const answer = answerOf(parsed);
      if (answer.text) {
        const p: Piece = { direction: "output", text: answer.text, calls: answer.calls };
        const { verdict, layers } = await judge(p, cfg.settings, { model, system, tools: answer.tools, uploadHosts: cfg.uploadHosts });
        if (verdict !== "allow") {
          const block = cfg.mode === "block" && verdict === "block";
          const rec = record(p, verdict, layers, block, model, to.name);
          await write(rec);
          if (block) return refusal(rec, anthropic);
        }
      }
    } catch (e) {
      console.error(`guard: output scan failed, ${block ? "refused" : "forwarding"}:`, e instanceof Error ? e.message : e);
      const rec = failure("output", block, model, to.name);
      await write(rec);
      if (block) return refusal(rec, anthropic);
    }
    return relay(resp, text);
  };
}

async function scanStream(stream: ReadableStream<Uint8Array>, cfg: Config, ctx: Context, upstream: string | undefined, write: (r: Record) => Promise<void>) {
  try {
    await scanSse(await new Response(stream).text(), cfg, ctx, upstream, write, false);
  } catch (e) {
    // It broke off: the agent has it as far as it came, and nobody read it.
    console.error("guard: stream not read to its end, not scanned:", e instanceof Error ? e.message : e);
    await write(failure("output", false, ctx.model, upstream));
  }
}

/** Scan a whole streamed answer. `mayBlock`: the agent does not have it yet. */
async function scanSse(sse: string, cfg: Config, ctx: Context, upstream: string | undefined, write: (r: Record) => Promise<void>, mayBlock: boolean): Promise<Record | undefined> {
  try {
    const c = new StreamCollector();
    c.push(sse + "\n");
    const text = c.text();
    if (!text) return;
    const p: Piece = { direction: "output", text, calls: c.calls() };
    const { verdict, layers } = await judge(p, cfg.settings, { ...ctx, tools: c.tools, uploadHosts: cfg.uploadHosts });
    if (verdict === "allow") return;
    const rec = record(p, verdict, layers, mayBlock && cfg.mode === "block" && verdict === "block", ctx.model, upstream);
    await write(rec);
    return rec;
  } catch (e) {
    const blocked = mayBlock && cfg.mode === "block";
    console.error(`guard: stream scan failed, ${blocked ? "refused" : "forwarding"}:`, e instanceof Error ? e.message : e);
    const rec = failure("output", blocked, ctx.model, upstream);
    await write(rec);
    return rec;
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

/** Over `GUARD_RATE`: the agent's SDK waits and tries again. */
function limited(anthropic: boolean, seconds: number): Response {
  const message = "dlprevent-guard: too many requests (GUARD_RATE)";
  const body = anthropic ? { type: "error", error: { type: "rate_limit_error", message } } : { error: { message, type: "guard_rate_limited", code: "rate_limit_exceeded" } };
  return new Response(JSON.stringify(body), { status: 429, headers: { "content-type": "application/json", "retry-after": String(seconds) } });
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
  const list = (name: string) => (Deno.env.get(name) ?? "").split(",").map((h) => h.trim()).filter((h) => h.length > 0);
  // A typo must not leave the limit off without anyone noticing.
  const count = (name: string) => {
    const v = Deno.env.get(name);
    if (!v) return undefined;
    if (!/^[1-9]\d*$/.test(v)) {
      console.error(`${name} must be a whole number above 0, not ${v}`);
      Deno.exit(1);
    }
    return Number(v);
  };
  const models = list("GUARD_MODELS");
  const limits: Limits = { models: models.length ? models : undefined, maxTokens: count("GUARD_MAX_TOKENS"), perMinute: count("GUARD_RATE") };
  const cfg: Config = {
    limits,
    routes,
    fallback,
    mode,
    trustUser: Deno.env.get("GUARD_TRUST_USER") === "1",
    uploadHosts: list("GUARD_UPLOAD_HOSTS").map((h) => h.toLowerCase()),
    log: Deno.env.get("GUARD_LOG") ?? "/var/log/dlprevent-guard/verdicts.jsonl",
    settings: await loadSettings(Deno.env.get("GUARD_POLICY")),
  };
  const write = async (r: Record) => {
    console.log(`guard: ${r.direction} ${r.verdict} ${r.action} ${r.layers.map((l) => l.rule ?? l.layer).join(",")}`);
    await Deno.writeTextFile(cfg.log, JSON.stringify(r) + "\n", { append: true, create: true });
  };
  const port = Number(Deno.env.get("GUARD_PORT") ?? "8787");
  // Whoever reaches the guard spends the provider key it carries. The
  // container sets 0.0.0.0 and publishes the port on 127.0.0.1 only.
  const hostname = Deno.env.get("GUARD_HOST") ?? "127.0.0.1";
  const keyOf = (u: Upstream) => (u.key ? "key set by the guard" : "key from the agent");
  console.log(`dlprevent-guard on ${hostname}:${port}, mode ${mode}${cfg.trustUser ? ", user trusted" : ""}, log ${cfg.log}`);
  if (fallback) console.log(`  /v1/…  -> ${fallback.url}, ${keyOf(fallback)}`);
  for (const [n, u] of Object.entries(routes)) console.log(`  /${n}/…  -> ${u.url}, ${keyOf(u)}`);
  if (models.length) console.log(`  models: ${models.join(", ")}`);
  if (limits.maxTokens || limits.perMinute) console.log(`  at most ${limits.maxTokens ?? "any"} tokens an answer, ${limits.perMinute ?? "any"} requests a minute`);
  const handle = handler(cfg, write);
  // One line per request: whether the agent goes through the guard at all
  // is the first thing anyone asks, and findings alone cannot answer it.
  // Method, path, status and time — no body, no header.
  Deno.serve({ port, hostname }, async (req) => {
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
