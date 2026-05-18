// OpenAI-compatibility smoke test for the AnveGuard proxy.
//
// Verifies the deployed /functions/v1/proxy edge function behaves like a
// drop-in OpenAI/Anthropic/Gemini endpoint for third-party SDKs.
//
// Usage:
//   ANVEGUARD_KEY=ag_live_... \
//   PROXY_BASE_URL=https://<project>.supabase.co/functions/v1/proxy \
//   deno run --allow-net --allow-env supabase/functions/proxy/openai_compat_smoke.ts
//
// PROXY_BASE_URL defaults to the production project. ANVEGUARD_KEY is required
// — generate one in the dashboard (Keys → Create) and paste it here. The key
// is only sent to the proxy, never logged.

const BASE = (Deno.env.get("PROXY_BASE_URL")
  ?? "https://lyrmhuwvdflngizhcqbj.supabase.co/functions/v1/proxy").replace(/\/+$/, "");
const KEY = Deno.env.get("ANVEGUARD_KEY") ?? "";

type Result = { name: string; ok: boolean; detail: string };
const results: Result[] = [];
function record(name: string, ok: boolean, detail = "") {
  results.push({ name, ok, detail });
  const tag = ok ? "PASS" : "FAIL";
  console.log(`  [${tag}] ${name}${detail ? " — " + detail : ""}`);
}

async function readSse(res: Response, maxFrames = 64): Promise<any[]> {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const frames: any[] = [];
  while (frames.length < maxFrames) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") { frames.push("[DONE]"); return frames; }
      try { frames.push(JSON.parse(payload)); } catch { /* partial */ }
    }
  }
  try { await reader.cancel(); } catch { /* noop */ }
  return frames;
}

console.log(`AnveGuard proxy smoke test`);
console.log(`  base: ${BASE}`);
console.log(`  key:  ${KEY ? KEY.slice(0, 12) + "…" : "(none — auth-positive tests will skip)"}`);
console.log("");

// --- 1. Health ---------------------------------------------------------------
{
  const r = await fetch(`${BASE}/healthz`);
  record("GET /healthz returns 200", r.status === 200, `status=${r.status}`);
  await r.text();
}

// --- 2. CORS preflight -------------------------------------------------------
{
  const r = await fetch(`${BASE}/v1/chat/completions`, {
    method: "OPTIONS",
    headers: { Origin: "https://example.com", "Access-Control-Request-Method": "POST" },
  });
  const ok = r.status === 200 && (r.headers.get("access-control-allow-origin") ?? "").length > 0;
  record("OPTIONS preflight returns CORS headers", ok,
    `status=${r.status}, allow-origin=${r.headers.get("access-control-allow-origin")}`);
  await r.text();
}

// --- 3. Missing key ---------------------------------------------------------
{
  const r = await fetch(`${BASE}/v1/models`);
  const body = await r.json().catch(() => ({}));
  const ok = r.status === 401 && body?.error?.code === "missing_api_key"
    && body?.error?.type === "authentication_error";
  record("GET /v1/models without key → 401 missing_api_key", ok,
    `status=${r.status}, code=${body?.error?.code}, type=${body?.error?.type}`);
}

// --- 4. Bogus key -----------------------------------------------------------
{
  const r = await fetch(`${BASE}/v1/models`, {
    headers: { Authorization: "Bearer ag_live_definitely_not_a_real_key" },
  });
  const body = await r.json().catch(() => ({}));
  const ok = (r.status === 401 || r.status === 429)
    && (body?.error?.code === "invalid_api_key" || body?.error?.code === "rate_limited");
  record("GET /v1/models with bogus key → 401 invalid_api_key", ok,
    `status=${r.status}, code=${body?.error?.code}`);
}

if (!KEY) {
  console.log("\nSkipping authenticated tests (set ANVEGUARD_KEY to run them).");
  summarize();
  Deno.exit(results.some((r) => !r.ok) ? 1 : 0);
}

// --- 5. /v1/models with Bearer ---------------------------------------------
{
  const r = await fetch(`${BASE}/v1/models`, {
    headers: { Authorization: `Bearer ${KEY}` },
  });
  const body = await r.json().catch(() => ({}));
  const ok = r.status === 200 && body?.object === "list" && Array.isArray(body?.data)
    && body.data.length > 0 && body.data[0]?.id && body.data[0]?.object === "model";
  record("GET /v1/models (Bearer) returns OpenAI list shape", ok,
    `status=${r.status}, count=${body?.data?.length}, first=${body?.data?.[0]?.id}`);
}

// --- 6. /v1/models with x-api-key (Anthropic style) ------------------------
{
  const r = await fetch(`${BASE}/v1/models`, { headers: { "x-api-key": KEY } });
  record("GET /v1/models (x-api-key) → 200", r.status === 200, `status=${r.status}`);
  await r.text();
}

// --- 7. /v1/models with ?key= (Gemini style) -------------------------------
{
  const r = await fetch(`${BASE}/v1/models?key=${encodeURIComponent(KEY)}`);
  record("GET /v1/models (?key=) → 200", r.status === 200, `status=${r.status}`);
  await r.text();
}

// --- 8. Missing messages → 400 invalid_request_error -----------------------
{
  const r = await fetch(`${BASE}/v1/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-4o-mini" }),
  });
  const body = await r.json().catch(() => ({}));
  const ok = r.status === 400 && body?.error?.code === "missing_messages"
    && body?.error?.type === "invalid_request_error" && body?.error?.param === "messages";
  record("POST /v1/chat/completions w/o messages → 400 invalid_request_error", ok,
    `status=${r.status}, code=${body?.error?.code}, type=${body?.error?.type}`);
}

// --- 9. Non-stream chat completion -----------------------------------------
let chatModel = "";
{
  const r = await fetch(`${BASE}/v1/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: "Reply with the single word: pong" }],
      max_tokens: 16,
    }),
  });
  const body = await r.json().catch(() => ({}));
  const choice = body?.choices?.[0];
  const ok = r.status === 200 && body?.object === "chat.completion"
    && typeof choice?.message?.content === "string" && choice.message.content.length > 0
    && typeof choice?.finish_reason === "string";
  chatModel = body?.model ?? "";
  record("POST /v1/chat/completions (non-stream) returns OpenAI shape", ok,
    `status=${r.status}, model=${body?.model}, content="${(choice?.message?.content ?? "").slice(0, 40)}", finish=${choice?.finish_reason}, usage=${JSON.stringify(body?.usage)}`);
}

// --- 10. Streaming chat completion -----------------------------------------
{
  const r = await fetch(`${BASE}/v1/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: "Count from 1 to 3, comma-separated, no other text." }],
      stream: true,
      max_tokens: 32,
    }),
  });
  const ct = r.headers.get("content-type") ?? "";
  if (r.status !== 200 || !ct.includes("text/event-stream")) {
    record("POST /v1/chat/completions (stream) returns SSE", false,
      `status=${r.status}, content-type=${ct}`);
    try { await r.body?.cancel(); } catch { /* noop */ }
  } else {
    const frames = await readSse(r);
    const objFrames = frames.filter((f) => typeof f === "object") as any[];
    const firstDelta = objFrames[0]?.choices?.[0]?.delta;
    const hasContent = objFrames.some((f) => typeof f?.choices?.[0]?.delta?.content === "string");
    const finish = objFrames.find((f) => f?.choices?.[0]?.finish_reason)?.choices?.[0]?.finish_reason;
    const terminated = frames[frames.length - 1] === "[DONE]";
    const allChunks = objFrames.every((f) => f?.object === "chat.completion.chunk");
    const ok = allChunks && hasContent && !!finish && terminated;
    record("POST /v1/chat/completions (stream) returns SSE", ok,
      `frames=${frames.length}, first_delta=${JSON.stringify(firstDelta)}, has_content=${hasContent}, finish=${finish}, terminated=${terminated}`);
  }
}

// --- 11. Anthropic /v1/messages shape --------------------------------------
{
  const r = await fetch(`${BASE}/v1/messages`, {
    method: "POST",
    headers: { "x-api-key": KEY, "Content-Type": "application/json", "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: chatModel || "claude-3-5-sonnet-latest",
      max_tokens: 32,
      messages: [{ role: "user", content: "Reply with the single word: pong" }],
    }),
  });
  const body = await r.json().catch(() => ({}));
  const ok = r.status === 200
    && (body?.type === "message" || Array.isArray(body?.content))
    && (typeof body?.content?.[0]?.text === "string" || typeof body?.content === "string");
  record("POST /v1/messages (Anthropic shape) returns message", ok,
    `status=${r.status}, type=${body?.type}, content=${JSON.stringify(body?.content)?.slice(0, 60)}`);
}

// --- 12. last_used_at bumped (sanity) — skipped; requires DB access --------

summarize();
Deno.exit(results.some((r) => !r.ok) ? 1 : 0);

function summarize() {
  const pass = results.filter((r) => r.ok).length;
  const fail = results.length - pass;
  console.log("");
  console.log(`Summary: ${pass}/${results.length} passed${fail ? `, ${fail} failed` : ""}.`);
}
