// AnveGuard proxy — OpenAI-compatible /v1/chat/completions endpoint.
// Public function; authenticated via AnveGuard API keys (Authorization: Bearer ag_live_...).
import { corsHeaders, json, service, sha256Hex, decryptString, callerIp, checkRateLimit, verifyClerkJwt } from "../_shared/anveguard.ts";
import { getProvider, resolveEndpoint, PROVIDERS } from "../_shared/providers.ts";
import { openaiToAnthropicRequest, anthropicToOpenAIResponse,
  anthropicStreamToOpenAI } from "../_shared/anthropic.ts";
import { chatToResponsesRequest, responsesToChatResponse,
  responsesStreamToChat } from "../_shared/responses_api.ts";
import {
  evaluate as evaluatePolicy, DEFAULT_SETTINGS,
  evaluateInjection, applySanitization,
  evaluateRetrieved,
  type PolicyRule, type PolicyIntent, type PolicySettings, type EvaluateResult,
  type LayerVerdict,
} from "../_shared/policy_engine.ts";
import {
  detectRequestShape, translateRequestToOpenAI, translateResponseFromOpenAI,
  type RequestShape,
} from "../_shared/shape_translators.ts";
import { parseModelsResponse } from "../_shared/models_parsers.ts";
import {
  validateSystemPrompt,
  resolveSystemPromptMax,
  decideSystemPromptGate,
  SYSTEM_PROMPT_DOC_URL,
} from "../_shared/system_prompt.ts";

// ---- Error envelope helpers ------------------------------------------------
// Every error response goes through `errorResponse` so the public shape is
// consistent regardless of which SDK called us. The OpenAI shape follows the
// official spec:
//   { "error": { "message": str, "type": str, "param": str|null, "code": str|null } }
// `type` describes the error class (invalid_request_error, authentication_error,
// permission_error, rate_limit_exceeded, api_error). `code` is a stable machine
// identifier (invalid_api_key, missing_messages, content_filter, …) that
// clients can switch on without parsing prose.

type ErrorOpts = {
  /** Stable machine code (e.g. "invalid_api_key", "content_filter"). */
  code?: string | null;
  /** Request param the error refers to (e.g. "messages", "model"). */
  param?: string | null;
  /** Extra response headers (e.g. Retry-After on 429). */
  headers?: Record<string, string>;
  /** Vendor-specific debug info echoed back under the `anveguard` key. */
  anveguard?: Record<string, unknown>;
  /** Optional public docs URL for this error class. Echoed under
   *  `error.doc_url` (OpenAI shape) and `error.anveguard.doc_url` so users
   *  can jump straight to the rule that rejected them. */
  doc_url?: string;
};

/** Pick the OpenAI `type` that best matches an HTTP status. */
function typeForStatus(status: number): string {
  if (status === 401 || status === 403) return status === 403 ? "permission_error" : "authentication_error";
  if (status === 404) return "invalid_request_error";
  if (status === 408 || status === 504) return "api_error";
  if (status === 429) return "rate_limit_exceeded";
  if (status >= 400 && status < 500) return "invalid_request_error";
  return "api_error";
}

function openaiErrorShape(message: string, type: string, opts: ErrorOpts = {}) {
  const err: Record<string, unknown> = {
    message,
    type,
    param: opts.param ?? null,
    code: opts.code ?? null,
  };
  if (opts.doc_url) err.doc_url = opts.doc_url;
  return { error: err };
}

/** Translate the OpenAI-shape error envelope into the public shape. */
function errorForShape(shape: RequestShape, status: number, message: string, opts: ErrorOpts = {}): unknown {
  const type = typeForStatus(status);
  if (shape === "anthropic") {
    return {
      type: "error",
      error: {
        type: opts.code ?? type,
        message,
        ...(opts.param ? { param: opts.param } : {}),
        ...(opts.doc_url ? { doc_url: opts.doc_url } : {}),
      },
    };
  }
  if (shape === "gemini") {
    return {
      error: {
        code: status,
        status: opts.code ?? type,
        message,
        ...(opts.param ? { param: opts.param } : {}),
        ...(opts.doc_url ? { doc_url: opts.doc_url } : {}),
      },
    };
  }
  const env = openaiErrorShape(message, type, opts);
  if (opts.anveguard) (env as any).anveguard = opts.anveguard;
  return env;
}

/** Build a Response with the right body, status, headers, and CORS. */
function errorResponse(
  shape: RequestShape, status: number, message: string, opts: ErrorOpts = {},
): Response {
  return json(errorForShape(shape, status, message, opts), status, opts.headers);
}

// ---- Health endpoint -------------------------------------------------------
// Lightweight readiness probe for uptime monitors. Pings the DB once, returns
// {status, db, time, version}. 200 when healthy, 503 when DB is unreachable.
// Intentionally unauthenticated — exposing existence-of-service is fine; the
// payload contains no secrets and no per-user data.

const SERVICE_VERSION = Deno.env.get("SUPABASE_FUNCTION_VERSION") ?? "dev";

async function handleHealth(): Promise<Response> {
  const start = Date.now();
  let dbOk = false;
  let dbError: string | null = null;
  try {
    const sb = service();
    // Cheap ping — head:true means rows aren't actually fetched, just counted.
    const { error } = await sb.from("rate_limit_buckets").select("scope", { count: "exact", head: true }).limit(0);
    dbOk = !error;
    if (error) dbError = error.message.slice(0, 120);
  } catch (e) {
    dbError = e instanceof Error ? e.message.slice(0, 120) : "unknown";
  }
  const body = {
    status: dbOk ? "ok" : "degraded",
    service: "anveguard-proxy",
    version: SERVICE_VERSION,
    db: dbOk ? "ok" : "down",
    db_error: dbError,
    db_latency_ms: Date.now() - start,
    time: new Date().toISOString(),
  };
  return json(body, dbOk ? 200 : 503);
}

// ---- Auth-failure rate limit ----------------------------------------------
// Two sliding-window buckets per caller IP: 5 fails/min (catches active
// brute-force) and 50 fails/hour (catches slow / distributed probing). Once
// either is over the limit, return 429 with Retry-After. Both call sites that
// emit 401 for missing/invalid keys go through this helper so the protection
// is uniform.
//
// Fails open if the rate-limit RPC errors (e.g. before the migration applies),
// see checkRateLimit in _shared/anveguard.ts.
const AUTH_FAIL_LIMIT_PER_MIN = 5;
const AUTH_FAIL_LIMIT_PER_HOUR = 50;

// ---- Phase 5: image generation handler -----------------------------------
// Minimum-viable forwarder for OpenAI-shaped /v1/images/generations.
// Differences from the chat path:
//   - Body is `{ prompt: string, model, size, n, ... }` not `{ messages: [...] }`
//   - No streaming, no output policy (image content moderation is a separate
//     track requiring an image classifier — not in this first pass)
//   - No alias / route / compression — all chat-only concepts
// Same as chat path:
//   - Auth, rate limit, input policy on the prompt, audit logging
const HANDLEABLE_IMAGE_PROVIDERS = new Set(["openai", "lovable", "custom"]);

async function handleImageGeneration(
  sb: ReturnType<typeof service>,
  _req: Request,
  keyRow: any,
  publicBody: any,
): Promise<Response> {
  const start = Date.now();

  // --- 1. Validate body shape -----------------------------------------
  const prompt = typeof publicBody?.prompt === "string" ? publicBody.prompt : "";
  if (!prompt) {
    return errorResponse("openai", 400, "Missing or invalid `prompt` (string required).",
      { code: "missing_prompt", param: "prompt" });
  }
  if (!HANDLEABLE_IMAGE_PROVIDERS.has(keyRow.provider)) {
    return errorResponse("openai", 501,
      `Image generation is currently supported only for OpenAI-compatible providers. Your key uses provider: ${keyRow.provider}.`,
      { code: "modality_unsupported_provider" });
  }

  // --- 2. Input policy on the prompt ----------------------------------
  const policyState = await loadWorkspacePolicy(sb, keyRow.user_id);
  let promptVerdict: Awaited<ReturnType<typeof evaluatePolicy>>;
  try {
    promptVerdict = await evaluatePolicy({
      text: prompt, direction: "input",
      settings: policyState.settings,
      legacy: policyState.legacy,
      rules: policyState.rules,
      intents: policyState.intents,
    });
  } catch (e) {
    console.error("[image-gen] policy eval failed:", e);
    promptVerdict = { verdict: "allow", layers: [], normalized: prompt, decoded_segments: [] };
  }

  if (promptVerdict.verdict === "block") {
    const blockReason = promptVerdict.layers.find((l) => l.verdict === "block")?.reason
      ?? "Blocked by input policy.";
    // Log the block so it appears in /dashboard/threats.
    await insertRequestLog(sb, {
      user_id: keyRow.user_id,
      api_key_id: keyRow.id,
      provider: keyRow.provider,
      model: publicBody?.model ?? "image-gen",
      messages: [{ role: "user", content: prompt }],
      response: null,
      status: "blocked_input",
      verdict: "block",
      verdict_layers: promptVerdict.layers,
      block_reason: blockReason,
      latency_ms: Date.now() - start,
    }, policyState.settings);
    await sb.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyRow.id);
    return errorResponse("openai", 400, `${policyState.blockMessage} ${blockReason}`,
      { code: "content_filter", anveguard: { reason: blockReason, layers: promptVerdict.layers } });
  }

  // --- 3. Resolve upstream key + URL ----------------------------------
  let upstreamKey: string | null = null;
  if (keyRow.provider_key_encrypted) {
    try { upstreamKey = await decryptString(keyRow.provider_key_encrypted); }
    catch (e) {
      console.error("[image-gen] key decrypt failed:", e);
      return errorResponse("openai", 500, "Internal proxy error (key resolution).",
        { code: "internal_error" });
    }
  }
  let resolved;
  try { resolved = resolveEndpoint(keyRow, upstreamKey); }
  catch (e) {
    return errorResponse("openai", 400, e instanceof Error ? e.message : String(e),
      { code: "endpoint_resolution_failed" });
  }
  // resolved.url is the chat completions URL. Derive the image URL by
  // swapping the path. This works for the OpenAI-compatible providers we
  // currently allow through HANDLEABLE_IMAGE_PROVIDERS.
  const imageUrl = resolved.url.replace(/\/v1\/chat\/completions(\?.*)?$/, "/v1/images/generations$1");
  if (imageUrl === resolved.url) {
    return errorResponse("openai", 501,
      "This endpoint's chat URL doesn't match a recognised pattern; cannot derive an image-gen URL automatically.",
      { code: "modality_url_resolution_failed", anveguard: { resolved_url: resolved.url } });
  }

  // --- 4. Forward to upstream -----------------------------------------
  let upstream: Response;
  try {
    upstream = await fetch(imageUrl, {
      method: "POST",
      headers: { ...resolved.headers, "Content-Type": "application/json" },
      body: JSON.stringify(publicBody),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await insertRequestLog(sb, {
      user_id: keyRow.user_id, api_key_id: keyRow.id, provider: keyRow.provider,
      model: publicBody?.model ?? "image-gen",
      messages: [{ role: "user", content: prompt }],
      response: { error: msg.slice(0, 500) },
      status: "error", verdict: "allow", verdict_layers: promptVerdict.layers,
      block_reason: null, latency_ms: Date.now() - start,
    }, policyState.settings);
    return errorResponse("openai", 502, "Upstream image-gen request failed.",
      { code: "upstream_error", anveguard: { detail: msg } });
  }

  const respText = await upstream.text();
  let respJson: any = null;
  try { respJson = respText ? JSON.parse(respText) : null; } catch { /* keep raw */ }

  const imageCount = Array.isArray(respJson?.data) ? respJson.data.length : 1;
  const estimatedCost = imageCount * 0.04;
  const promptTokens = approximateTokens(prompt);

  // --- 5. Log + return ------------------------------------------------
  await insertRequestLog(sb, {
    user_id: keyRow.user_id,
    api_key_id: keyRow.id,
    provider: keyRow.provider,
    model: publicBody?.model ?? "image-gen",
    messages: [{ role: "user", content: prompt }],
    // Image responses contain b64 or URLs — could be huge. Trim to a
    // metadata snapshot for log space; preserve count + size + revised_prompt.
    response: respJson
      ? {
          model: respJson?.model ?? null,
          created: respJson?.created ?? null,
          image_count: imageCount,
          first_revised_prompt: respJson?.data?.[0]?.revised_prompt ?? null,
          response_format: respJson?.data?.[0]?.url ? "url" : respJson?.data?.[0]?.b64_json ? "b64_json" : null,
        }
      : { raw: respText.slice(0, 1000) },
    status: upstream.ok ? "allowed" : "error",
    verdict: "allow",
    verdict_layers: promptVerdict.layers,
    block_reason: null,
    latency_ms: Date.now() - start,
  }, policyState.settings);

  if (upstream.ok) {
    await incrementSpendsAtomic(sb, keyRow.id, estimatedCost, promptTokens);
  }
  await sb.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyRow.id);

  // Pass the upstream response through unchanged — clients get the OpenAI
  // image-gen response shape they expect.
  return new Response(respText, {
    status: upstream.status,
    headers: {
      ...corsHeaders,
      "Content-Type": upstream.headers.get("content-type") ?? "application/json",
    },
  });
}

// ---- Phase 5: text-to-speech handler -------------------------------------
// JSON body { model, input, voice, response_format? } → binary audio
// (mp3/opus/aac/flac). Policy runs on `input` text BEFORE forwarding so
// harmful prompts can't be turned into audio. Response is passed through
// as binary bytes with the upstream's Content-Type preserved so the
// caller's SDK can write the file directly.
const HANDLEABLE_TTS_PROVIDERS = new Set(["openai", "lovable", "custom"]);
const MAX_TTS_INPUT_CHARS = 5000;  // OpenAI TTS hard cap

async function handleAudioSpeech(
  sb: ReturnType<typeof service>,
  _req: Request,
  keyRow: any,
  publicBody: any,
): Promise<Response> {
  const start = Date.now();

  if (!HANDLEABLE_TTS_PROVIDERS.has(keyRow.provider)) {
    return errorResponse("openai", 501,
      `Text-to-speech is currently supported only for OpenAI-compatible providers. Your key uses provider: ${keyRow.provider}.`,
      { code: "modality_unsupported_provider" });
  }

  const input = typeof publicBody?.input === "string" ? publicBody.input : "";
  if (!input) {
    return errorResponse("openai", 400, "Missing or invalid `input` (string required).",
      { code: "missing_input", param: "input" });
  }
  if (input.length > MAX_TTS_INPUT_CHARS) {
    return errorResponse("openai", 400,
      `input exceeds ${MAX_TTS_INPUT_CHARS} chars (OpenAI TTS hard cap).`,
      { code: "input_too_long", param: "input" });
  }

  // Input policy on the text — same engine as chat / image. If the user
  // tries to TTS a jailbreak/CSAM/persona-bypass payload, block it.
  const policyState = await loadWorkspacePolicy(sb, keyRow.user_id);
  let promptVerdict: Awaited<ReturnType<typeof evaluatePolicy>>;
  try {
    promptVerdict = await evaluatePolicy({
      text: input, direction: "input",
      settings: policyState.settings,
      legacy: policyState.legacy,
      rules: policyState.rules,
      intents: policyState.intents,
    });
  } catch (e) {
    console.error("[tts] policy eval failed:", e);
    promptVerdict = { verdict: "allow", layers: [], normalized: input, decoded_segments: [] };
  }

  if (promptVerdict.verdict === "block") {
    const blockReason = promptVerdict.layers.find((l) => l.verdict === "block")?.reason
      ?? "Blocked by input policy.";
    await insertRequestLog(sb, {
      user_id: keyRow.user_id, api_key_id: keyRow.id,
      provider: keyRow.provider, model: publicBody?.model ?? "tts",
      messages: [{ role: "user", content: input.slice(0, 1000) }],
      response: null,
      status: "blocked_input", verdict: "block",
      verdict_layers: promptVerdict.layers,
      block_reason: blockReason,
      latency_ms: Date.now() - start,
    }, policyState.settings);
    await sb.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyRow.id);
    return errorResponse("openai", 400, `${policyState.blockMessage} ${blockReason}`,
      { code: "content_filter", anveguard: { reason: blockReason, layers: promptVerdict.layers } });
  }

  // Resolve upstream URL + key.
  let upstreamKey: string | null = null;
  if (keyRow.provider_key_encrypted) {
    try { upstreamKey = await decryptString(keyRow.provider_key_encrypted); }
    catch (e) {
      console.error("[tts] key decrypt failed:", e);
      return errorResponse("openai", 500, "Internal proxy error (key resolution).",
        { code: "internal_error" });
    }
  }
  let resolved;
  try { resolved = resolveEndpoint(keyRow, upstreamKey); }
  catch (e) {
    return errorResponse("openai", 400, e instanceof Error ? e.message : String(e),
      { code: "endpoint_resolution_failed" });
  }
  const ttsUrl = resolved.url.replace(/\/v1\/chat\/completions(\?.*)?$/, "/v1/audio/speech$1");
  if (ttsUrl === resolved.url) {
    return errorResponse("openai", 501,
      "This endpoint's chat URL doesn't match a recognised pattern; cannot derive a TTS URL automatically.",
      { code: "modality_url_resolution_failed" });
  }

  // Forward POST as JSON (TTS is JSON in / binary out).
  let upstream: Response;
  try {
    upstream = await fetch(ttsUrl, {
      method: "POST",
      headers: { ...resolved.headers, "Content-Type": "application/json" },
      body: JSON.stringify(publicBody),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return errorResponse("openai", 502, "Upstream TTS request failed.",
      { code: "upstream_error", anveguard: { detail: msg } });
  }

  // Read the binary response so we can both log size + return bytes. For
  // very large TTS responses we still buffer; OpenAI TTS at 5000-char input
  // produces ~few-MB mp3 files, manageable in edge function memory.
  const audioBuf = await upstream.arrayBuffer();

  await insertRequestLog(sb, {
    user_id: keyRow.user_id, api_key_id: keyRow.id,
    provider: keyRow.provider, model: publicBody?.model ?? "tts",
    messages: [{ role: "user", content: input.slice(0, 1000) }],
    // Don't store the audio bytes themselves — they can be MB. Just metadata.
    response: {
      audio_bytes: audioBuf.byteLength,
      voice: publicBody?.voice ?? null,
      format: upstream.headers.get("content-type") ?? null,
      response_format: publicBody?.response_format ?? null,
    },
    status: upstream.ok ? "allowed" : "error",
    verdict: "allow",
    verdict_layers: promptVerdict.layers,
    block_reason: null,
    latency_ms: Date.now() - start,
  }, policyState.settings);

  if (upstream.ok) {
    const isHd = String(publicBody?.model ?? "").includes("hd");
    const estimatedCost = (input.length / 1000) * (isHd ? 0.030 : 0.015);
    const promptTokens = approximateTokens(input);
    await incrementSpendsAtomic(sb, keyRow.id, estimatedCost, promptTokens);
  }
  await sb.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyRow.id);

  return new Response(audioBuf, {
    status: upstream.status,
    headers: {
      ...corsHeaders,
      "Content-Type": upstream.headers.get("content-type") ?? "audio/mpeg",
      "Content-Length": String(audioBuf.byteLength),
    },
  });
}

// ---- Phase 5: audio transcription handler --------------------------------
// Minimum-viable forwarder for OpenAI Whisper /v1/audio/transcriptions.
// Differences from the chat / image-gen paths:
//   - Body is multipart/form-data (file upload) — we forward bytes-for-bytes
//     so the boundary stays valid.
//   - Response is JSON {"text":"..."} (when response_format defaults to json).
//   - Policy runs on the TRANSCRIBED TEXT after the upstream returns. We
//     treat it as input-direction since the text typically becomes a chat
//     prompt downstream — same vectors apply (jailbreak, exfil, etc.).
// Same as chat/image:
//   - Auth + rate limit (existing flow before branch)
//   - Audit logging via request_logs
const HANDLEABLE_AUDIO_PROVIDERS = new Set(["openai", "lovable", "custom"]);
const MAX_AUDIO_BYTES = 26 * 1024 * 1024; // 26MB — matches OpenAI's 25MB limit + headroom

async function handleAudioTranscription(
  sb: ReturnType<typeof service>,
  req: Request,
  keyRow: any,
): Promise<Response> {
  const start = Date.now();

  if (!HANDLEABLE_AUDIO_PROVIDERS.has(keyRow.provider)) {
    return errorResponse("openai", 501,
      `Audio transcription is currently supported only for OpenAI-compatible providers. Your key uses provider: ${keyRow.provider}.`,
      { code: "modality_unsupported_provider" });
  }

  const contentType = req.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    return errorResponse("openai", 400,
      "Audio transcription expects a multipart/form-data body (the OpenAI SDK formats this automatically).",
      { code: "invalid_content_type" });
  }

  // Read raw bytes — Whisper caps at 25MB. We add a 26MB hard cap and reject
  // anything larger to bound memory and latency.
  const buf = await req.arrayBuffer();
  if (buf.byteLength > MAX_AUDIO_BYTES) {
    return errorResponse("openai", 413,
      `Audio file exceeds ${MAX_AUDIO_BYTES} bytes (${(MAX_AUDIO_BYTES / 1024 / 1024).toFixed(0)}MB). Whisper's hard limit is 25MB.`,
      { code: "audio_too_large" });
  }

  // Resolve upstream URL + key.
  let upstreamKey: string | null = null;
  if (keyRow.provider_key_encrypted) {
    try { upstreamKey = await decryptString(keyRow.provider_key_encrypted); }
    catch (e) {
      console.error("[audio] key decrypt failed:", e);
      return errorResponse("openai", 500, "Internal proxy error (key resolution).",
        { code: "internal_error" });
    }
  }
  let resolved;
  try { resolved = resolveEndpoint(keyRow, upstreamKey); }
  catch (e) {
    return errorResponse("openai", 400, e instanceof Error ? e.message : String(e),
      { code: "endpoint_resolution_failed" });
  }
  // Derive transcription URL by swapping the chat-completions path.
  const transcriptionUrl = resolved.url.replace(/\/v1\/chat\/completions(\?.*)?$/, "/v1/audio/transcriptions$1");
  if (transcriptionUrl === resolved.url) {
    return errorResponse("openai", 501,
      "This endpoint's chat URL doesn't match a recognised pattern; cannot derive an audio-transcription URL automatically.",
      { code: "modality_url_resolution_failed" });
  }

  // Forward upstream — preserve the original Content-Type (it carries the
  // multipart boundary) and pass the raw body bytes through.
  let upstream: Response;
  try {
    const upstreamHeaders: Record<string, string> = { ...resolved.headers, "Content-Type": contentType };
    upstream = await fetch(transcriptionUrl, {
      method: "POST", headers: upstreamHeaders, body: buf,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return errorResponse("openai", 502, "Upstream audio-transcription request failed.",
      { code: "upstream_error", anveguard: { detail: msg } });
  }

  const respText = await upstream.text();
  let respJson: any = null;
  try { respJson = respText ? JSON.parse(respText) : null; } catch { /* keep raw */ }
  const transcribed: string = typeof respJson?.text === "string" ? respJson.text : "";

  // Run input policy on the transcribed text. If the model produced something
  // jailbreak-shaped (or the user dictated it), we redact and warn rather
  // than block silently — the caller still gets the response, but with the
  // policy verdict echoed under `anveguard` for SDK introspection.
  let promptVerdict: Awaited<ReturnType<typeof evaluatePolicy>> | null = null;
  const policyState = await loadWorkspacePolicy(sb, keyRow.user_id);
  if (transcribed && upstream.ok) {
    try {
      promptVerdict = await evaluatePolicy({
        text: transcribed, direction: "input",
        settings: policyState.settings,
        legacy: policyState.legacy,
        rules: policyState.rules,
        intents: policyState.intents,
      });
    } catch (e) {
      console.error("[audio] policy eval failed:", e);
    }
    if (promptVerdict?.verdict === "block") {
      const blockReason = promptVerdict.layers.find((l) => l.verdict === "block")?.reason
        ?? "Blocked by input policy.";
      // Log as blocked_output (transcription is conceptually output of the
      // model — even though the resulting text would BECOME an input later).
      await insertRequestLog(sb, {
        user_id: keyRow.user_id, api_key_id: keyRow.id,
        provider: keyRow.provider, model: "whisper-transcription",
        messages: [{ role: "user", content: "[audio file]" }],
        response: { transcribed_excerpt: transcribed.slice(0, 200) },
        status: "blocked_output", verdict: "block",
        verdict_layers: promptVerdict.layers,
        block_reason: blockReason,
        latency_ms: Date.now() - start,
      }, policyState.settings);
      await sb.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyRow.id);
      return errorResponse("openai", 400, `${policyState.blockMessage} ${blockReason}`,
        { code: "content_filter", anveguard: { reason: blockReason, layers: promptVerdict.layers } });
    }
  }

  // Log + return.
  await insertRequestLog(sb, {
    user_id: keyRow.user_id, api_key_id: keyRow.id,
    provider: keyRow.provider, model: "whisper-transcription",
    messages: [{ role: "user", content: "[audio file]" }],
    response: respJson
      ? { text: transcribed.slice(0, 4000), text_length: transcribed.length }
      : { raw: respText.slice(0, 1000) },
    status: upstream.ok ? "allowed" : "error",
    verdict: promptVerdict?.verdict ?? "allow",
    verdict_layers: promptVerdict?.layers ?? [],
    block_reason: null,
    latency_ms: Date.now() - start,
  }, policyState.settings);

  if (upstream.ok) {
    const estimatedCost = Math.max(0.006, (buf.byteLength / (1024 * 1024)) * 0.006);
    const promptTokens = approximateTokens(transcribed);
    await incrementSpendsAtomic(sb, keyRow.id, estimatedCost, promptTokens);
  }
  await sb.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyRow.id);

  return new Response(respText, {
    status: upstream.status,
    headers: {
      ...corsHeaders,
      "Content-Type": upstream.headers.get("content-type") ?? "application/json",
    },
  });
}

/**
 * Resolve the AnveGuard key row for a proxy request via either:
 *   A. Public path — `Authorization: Bearer ag_live_…` (or x-api-key / ?key=),
 *      hashed and looked up by `key_hash`. Unchanged behaviour for external SDKs.
 *   B. Dashboard session — `Authorization: Bearer <Clerk JWT>` plus
 *      `x-anveguard-key-id: <uuid>`. JWT is verified, key row is loaded by id,
 *      and `key.user_id === claims.sub` is enforced. Lets the in-app Playground
 *      send requests without the user pasting the once-shown `ag_live_…` secret.
 *
 * Returns `{ keyRow }` on success or `{ error: { message, code } }` on failure.
 * Callers translate the error through their own error envelope.
 */
async function resolveProxyKeyAuth(
  sb: ReturnType<typeof service>,
  req: Request,
  selectColumns: string,
): Promise<{ keyRow: any | null; error?: { message: string; code: string } }> {
  const reqUrl = new URL(req.url);
  const authHeader = req.headers.get("Authorization") || req.headers.get("authorization") || "";
  const xApiKey = req.headers.get("x-api-key") || req.headers.get("X-API-Key") || "";
  const queryKey = reqUrl.searchParams.get("key") || "";
  const sessionKeyId =
    req.headers.get("x-anveguard-key-id") || req.headers.get("X-AnveGuard-Key-Id") || "";

  // Path A — public secret in any standard slot.
  const bearerAg = authHeader.match(/^Bearer\s+(ag_live_\S+)/i)?.[1];
  const apiKeyPlain = bearerAg
    || (xApiKey.startsWith("ag_live_") ? xApiKey : "")
    || (queryKey.startsWith("ag_live_") ? queryKey : "");
  if (apiKeyPlain) {
    const key_hash = await sha256Hex(apiKeyPlain);
    const { data } = await sb.from("api_keys")
      .select(selectColumns).eq("key_hash", key_hash).maybeSingle();
    if (!data || !(data as any).is_active) {
      return { keyRow: null, error: { message: "Invalid or revoked API key.", code: "invalid_api_key" } };
    }
    return { keyRow: data };
  }

  // Path B — dashboard session (Clerk JWT + key id header).
  const bearerAny = authHeader.match(/^Bearer\s+(\S+)/i)?.[1];
  if (bearerAny && sessionKeyId) {
    let claims: { sub: string };
    try { claims = await verifyClerkJwt(bearerAny); }
    catch {
      return { keyRow: null, error: { message: "Invalid dashboard session token.", code: "invalid_session" } };
    }
    const { data } = await sb.from("api_keys")
      .select(selectColumns).eq("id", sessionKeyId).maybeSingle();
    if (!data || !(data as any).is_active) {
      return { keyRow: null, error: { message: "Invalid or revoked API key.", code: "invalid_api_key" } };
    }
    if ((data as any).user_id !== claims.sub) {
      return { keyRow: null, error: { message: "Key does not belong to the current dashboard session.", code: "key_session_mismatch" } };
    }
    return { keyRow: data };
  }

  return {
    keyRow: null,
    error: {
      message: "Missing API key. Provide it in the Authorization header (Bearer ag_live_…), the x-api-key header, or the ?key= query param.",
      code: "missing_api_key",
    },
  };
}

async function rateLimitedAuthFailure(
  sb: ReturnType<typeof service>,
  req: Request,
  shape: RequestShape,
  message: string,
  code: string,
): Promise<Response> {
  const ip = callerIp(req);
  const min = await checkRateLimit(sb, "proxy_auth_fail_min", ip, AUTH_FAIL_LIMIT_PER_MIN, 60);
  const hour = await checkRateLimit(sb, "proxy_auth_fail_hour", ip, AUTH_FAIL_LIMIT_PER_HOUR, 3600);
  if (!min.allowed || !hour.allowed) {
    const retryAfter = Math.max(min.retryAfterSeconds, hour.retryAfterSeconds);
    return errorResponse(shape, 429, "Too many failed authentication attempts. Try again later.", {
      code: "rate_limited",
      headers: { "Retry-After": String(retryAfter) },
    });
  }
  return errorResponse(shape, 401, message, { code });
}

// ---- SSE helpers -----------------------------------------------------------
// Header set used for every Server-Sent Events response. `X-Accel-Buffering:
// no` and `Connection: keep-alive` defeat reverse-proxy buffering so deltas
// reach the client as soon as we write them.
const sseHeaders = {
  ...corsHeaders,
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  "Connection": "keep-alive",
  "X-Accel-Buffering": "no",
};

/** Encode a single OpenAI-style SSE chunk: `data: {json}\n\n`. */
function sseEncode(obj: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`);
}
const SSE_DONE = new TextEncoder().encode("data: [DONE]\n\n");

/**
 * Build a complete OpenAI-shape SSE stream for a fully-formed assistant
 * message. Used when policy blocks input or output: the client gets a normal
 * streaming experience (role chunk → content chunk → finish chunk → [DONE])
 * so SDKs that iterate the stream complete cleanly instead of hanging.
 */
function buildSyntheticSseStream(opts: {
  model: string;
  content: string;
  finishReason: string;
  anveguard?: Record<string, unknown>;
}): ReadableStream<Uint8Array> {
  const id = `chatcmpl-${crypto.randomUUID()}`;
  const created = Math.floor(Date.now() / 1000);
  const base = { id, object: "chat.completion.chunk", created, model: opts.model };
  return new ReadableStream({
    start(controller) {
      controller.enqueue(sseEncode({
        ...base,
        choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }],
      }));
      if (opts.content) {
        controller.enqueue(sseEncode({
          ...base,
          choices: [{ index: 0, delta: { content: opts.content }, finish_reason: null }],
        }));
      }
      controller.enqueue(sseEncode({
        ...base,
        choices: [{ index: 0, delta: {}, finish_reason: opts.finishReason }],
        ...(opts.anveguard ? { anveguard: opts.anveguard } : {}),
      }));
      controller.enqueue(SSE_DONE);
      controller.close();
    },
  });
}

/**
 * Load all policy state for a workspace in one round trip.
 * Falls back to safe defaults if rows are missing.
 */
async function loadWorkspacePolicy(sb: any, userId: string): Promise<{
  legacy: { blocked_keywords: string[]; allowed_keywords: string[]; use_global_defaults: boolean };
  rules: PolicyRule[];
  intents: PolicyIntent[];
  settings: PolicySettings;
  blockMessage: string;
}> {
  const [legacyRes, settingsRes, rulesRes, intentsRes] = await Promise.all([
    sb.from("policies").select("*").eq("user_id", userId).maybeSingle(),
    sb.from("policy_settings").select("*").eq("user_id", userId).maybeSingle(),
    sb.from("policy_rules").select("*").eq("user_id", userId).eq("enabled", true),
    sb.from("policy_intents").select("*").eq("user_id", userId),
  ]);
  return {
    legacy: {
      blocked_keywords: legacyRes.data?.blocked_keywords ?? [],
      allowed_keywords: legacyRes.data?.allowed_keywords ?? [],
      use_global_defaults: legacyRes.data?.use_global_defaults !== false,
    },
    rules: (rulesRes.data ?? []) as PolicyRule[],
    intents: (intentsRes.data ?? []) as PolicyIntent[],
    settings: settingsRes.data ?? DEFAULT_SETTINGS,
    blockMessage: legacyRes.data?.block_message || "This request was blocked by your organization's AI policy.",
  };
}

/** Pull the first system-role message text out of an OpenAI-shape body. */
function extractSystemPrompt(messages: any[]): string | undefined {
  const sys = messages.find((m) => m?.role === "system");
  if (!sys) return undefined;
  return typeof sys.content === "string" ? sys.content : JSON.stringify(sys.content ?? "");
}

/**
 * Run the output direction of the layered evaluator and turn its verdict into
 * the (status, block_reason, verdict_layers) tuple the request log expects.
 */
async function evaluateOutput(
  text: string,
  policyState: Awaited<ReturnType<typeof loadWorkspacePolicy>>,
  ctx: { systemPrompt?: string; toolsRequested?: boolean },
): Promise<{ status: "allowed" | "blocked_output"; blockReason: string | null; layers: any[] }> {
  if (!text) return { status: "allowed", blockReason: null, layers: [] };
  const r = await evaluatePolicy(
    {
      text,
      direction: "output",
      legacy: policyState.legacy,
      rules: policyState.rules,
      intents: policyState.intents,
      settings: policyState.settings,
    },
    ctx,
  );
  if (r.verdict === "block") {
    const reason = r.layers.find((l) => l.verdict === "block")?.reason ?? "Output blocked by policy";
    return { status: "blocked_output", blockReason: reason, layers: r.layers };
  }
  return { status: "allowed", blockReason: null, layers: r.layers };
}

function calculateEstimatedCost(model: string, promptTokens: number, completionTokens: number): number {
  const m = String(model).toLowerCase();
  let inputRate = 0.0000015; // default fallback input price per token
  let outputRate = 0.0000045; // default fallback output price per token

  if (m.includes("gpt-4o-mini") || m.includes("gpt-4-mini") || m.includes("gpt-5-mini")) {
    inputRate = 0.00000015;
    outputRate = 0.00000060;
  } else if (m.includes("gpt-4o") || m.includes("gpt-5")) {
    inputRate = 0.0000025;
    outputRate = 0.0000100;
  } else if (m.includes("o1") || m.includes("o3") || m.includes("gpt-4")) {
    inputRate = 0.0000030;
    outputRate = 0.0000120;
  } else if (m.includes("claude-3-5-sonnet") || m.includes("claude-4")) {
    inputRate = 0.0000030;
    outputRate = 0.0000150;
  } else if (m.includes("claude-3-5-haiku")) {
    inputRate = 0.0000008;
    outputRate = 0.0000040;
  } else if (m.includes("gemini-1.5-flash") || m.includes("gemini-2-flash")) {
    inputRate = 0.000000075;
    outputRate = 0.00000030;
  } else if (m.includes("gemini-1.5-pro") || m.includes("gemini-2-pro")) {
    inputRate = 0.00000125;
    outputRate = 0.00000500;
  } else if (m.includes("deepseek")) {
    inputRate = 0.00000014;
    outputRate = 0.00000028;
  }

  return (promptTokens * inputRate) + (completionTokens * outputRate);
}

function approximateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

function checkApiKeyQuota(
  sb: ReturnType<typeof service>,
  keyRow: any,
  shape: RequestShape
): { allowed: boolean; errorResponse?: Response } {
  const hasSpendLimit = keyRow.spend_limit_usd !== null && keyRow.spend_limit_usd !== undefined;
  const hasTokenLimit = keyRow.token_limit !== null && keyRow.token_limit !== undefined;
  if (!hasSpendLimit && !hasTokenLimit) {
    return { allowed: true };
  }

  const now = new Date();
  const limitResetAt = keyRow.limit_reset_at ? new Date(keyRow.limit_reset_at) : null;
  let currentSpend = Number(keyRow.current_spend_usd || 0);
  let currentTokenSpend = Number(keyRow.current_token_spend || 0);

  if (limitResetAt && now >= limitResetAt) {
    currentSpend = 0;
    currentTokenSpend = 0;
    let nextReset: Date | null = null;
    const window = keyRow.limit_window || "infinite";
    if (window === "daily") {
      nextReset = new Date(now);
      nextReset.setDate(nextReset.getDate() + 1);
      nextReset.setHours(0, 0, 0, 0);
    } else if (window === "monthly") {
      nextReset = new Date(now);
      nextReset.setMonth(nextReset.getMonth() + 1);
      nextReset.setDate(1);
      nextReset.setHours(0, 0, 0, 0);
    }

    sb.from("api_keys").update({
      current_spend_usd: 0,
      current_token_spend: 0,
      limit_reset_at: nextReset ? nextReset.toISOString() : null,
    }).eq("id", keyRow.id).then(({ error }) => {
      if (error) console.error("Failed to reset api key quota:", error);
    });
  } else if (!limitResetAt && keyRow.limit_window && keyRow.limit_window !== "infinite") {
    let nextReset: Date | null = null;
    const window = keyRow.limit_window;
    if (window === "daily") {
      nextReset = new Date(now);
      nextReset.setDate(nextReset.getDate() + 1);
      nextReset.setHours(0, 0, 0, 0);
    } else if (window === "monthly") {
      nextReset = new Date(now);
      nextReset.setMonth(nextReset.getMonth() + 1);
      nextReset.setDate(1);
      nextReset.setHours(0, 0, 0, 0);
    }
    if (nextReset) {
      sb.from("api_keys").update({
        limit_reset_at: nextReset.toISOString(),
      }).eq("id", keyRow.id).then(({ error }) => {
        if (error) console.error("Failed to initialize reset date:", error);
      });
    }
  }

  if (hasSpendLimit && currentSpend >= Number(keyRow.spend_limit_usd)) {
    return {
      allowed: false,
      errorResponse: errorResponse(shape, 429, "API key spend limit exceeded.", {
        code: "spend_limit_exceeded",
        type: "insufficient_funds",
      })
    };
  }

  if (hasTokenLimit && currentTokenSpend >= Number(keyRow.token_limit)) {
    return {
      allowed: false,
      errorResponse: errorResponse(shape, 429, "API key token budget exceeded.", {
        code: "token_limit_exceeded",
        type: "insufficient_funds",
      })
    };
  }

  return { allowed: true };
}

async function insertRequestLog(
  sb: ReturnType<typeof service>,
  log: Record<string, any>,
  settings?: any
) {
  try {
    const enableMetadataOnly = settings?.enable_metadata_only_logs === true;
    if (enableMetadataOnly) {
      if (log.messages) {
        const plainMessages = typeof log.messages === "string" ? log.messages : JSON.stringify(log.messages);
        const hash = await sha256Hex(plainMessages);
        log.messages = [
          { role: "system", content: `[SCRUBBED - ZERO KNOWLEDGE HIPAA LOGS ENABLED. Payload SHA-256: ${hash}]` }
        ];
      }
      if (log.response) {
        const plainResponse = typeof log.response === "string" ? log.response : JSON.stringify(log.response);
        const hash = await sha256Hex(plainResponse);
        log.response = {
          object: "chat.completion",
          choices: [{
            index: 0,
            message: { role: "assistant", content: `[SCRUBBED - ZERO KNOWLEDGE HIPAA LOGS ENABLED. Payload SHA-256: ${hash}]` }
          }],
          usage: log.response?.usage || { prompt_tokens: log.tokens_in || 0, completion_tokens: log.tokens_out || 0 }
        };
      }
      if (log.verdict_layers && Array.isArray(log.verdict_layers)) {
        log.verdict_layers = log.verdict_layers.map((l: any) => ({
          ...l,
          matched: l.matched ? "[SCRUBBED]" : undefined,
          reason: l.reason ? l.reason.replace(/["'].*?["']/g, "'[SCRUBBED]'") : undefined
        }));
      }
    }
    return await sb.from("request_logs").insert(log);
  } catch (err) {
    console.error("Failed inserting request log:", err);
  }
}

async function incrementSpendsAtomic(
  sb: ReturnType<typeof service>,
  keyId: string,
  costUsd: number,
  tokens: number
) {
  try {
    const { error } = await sb.rpc("increment_api_key_spends", {
      _key_id: keyId,
      _cost: costUsd,
      _tokens: tokens,
    });
    if (error) {
      console.error("Failed to increment API key spends atomically:", error);
    }
  } catch (err) {
    console.error("Failed executing increment_api_key_spends RPC:", err);
  }
}




Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  // GET /v1/models — OpenAI-spec model listing, served from the upstream
  // provider configured for the AnveGuard key. POST stays the chat/completions
  // path. Anything else: 405.
  if (req.method === "GET") {
    const path = new URL(req.url).pathname.replace(/\/+$/, "");
    // Health endpoint for uptime monitors (Better Stack, UptimeRobot, etc.).
    // No auth — anyone can ping. Cheap: a single SELECT roundtrip. Returns 200
    // when DB is reachable, 503 when not. Caches CORS as wildcard so monitors
    // from any origin can read.
    if (path.endsWith("/healthz") || path.endsWith("/health")) {
      return await handleHealth();
    }
    if (path.endsWith("/v1/models")) {
      try { return await handleListModels(req); }
      catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[proxy] list_models error:", msg);
        return errorResponse("openai", 500, "Internal proxy error", { code: "internal_error", anveguard: { detail: msg } });
      }
    }
    return json(openaiErrorShape("Method not allowed.", typeForStatus(405), { code: "method_not_allowed" }), 405, { Allow: "POST, GET, OPTIONS" });
  }
  if (req.method !== "POST") {
    return json(openaiErrorShape("Method not allowed. Use POST.", typeForStatus(405), { code: "method_not_allowed" }), 405, { Allow: "POST, GET, OPTIONS" });
  }
  try {
    return await handleRequest(req);
  } catch (e) {
    // Last-resort catch — anything that escapes the request handler. Keep the
    // envelope identical to upstream-style 500s so SDKs handle it uniformly.
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[proxy] unhandled error:", msg);
    let shape: RequestShape = "openai";
    try { shape = detectRequestShape(new URL(req.url)).shape; } catch { /* ignore */ }
    return errorResponse(shape, 500, "Internal proxy error", { code: "internal_error", anveguard: { detail: msg } });
  }
});

/**
 * GET /v1/models — auth with the AnveGuard key, resolve the upstream
 * provider's `models_url`, fetch it with the user's stored provider key,
 * and return an OpenAI-spec `{ object: "list", data: [...] }` envelope so
 * SDK consumers (`openai.models.list()`, etc.) work transparently.
 *
 * Errors flow through the same standardized OpenAI error envelope used by
 * /v1/chat/completions.
 */
async function handleListModels(req: Request): Promise<Response> {
  const sb = service();

  const auth = await resolveProxyKeyAuth(
    sb, req,
    "id,user_id,provider,provider_key_encrypted,is_active,custom_base_url,custom_models_url,custom_kind,custom_auth_scheme,custom_auth_header,custom_extra_headers,custom_path_prefix,custom_chat_path,custom_models_path,custom_response_format,spend_limit_usd,current_spend_usd,token_limit,current_token_spend,limit_window,limit_reset_at",
  );
  if (auth.error || !auth.keyRow) {
    return errorResponse("openai", 401, auth.error?.message ?? "Unauthorized", { code: auth.error?.code ?? "invalid_api_key" });
  }
  const keyRow = auth.keyRow;

  // For providers without a live /v1/models endpoint (e.g. Lovable Gateway),
  // serve a static catalog built from the provider definition so third-party
  // SDKs that call `client.models.list()` still get a valid OpenAI envelope.
  const nowSecStatic = Math.floor(Date.now() / 1000);
  const providerDef = PROVIDERS.find((p) => p.id === keyRow.provider);
  if (providerDef && !providerDef.models_url && Array.isArray(providerDef.model_suggestions) && providerDef.model_suggestions.length > 0) {
    const staticData = providerDef.model_suggestions.map((id) => ({
      id, object: "model", created: nowSecStatic, owned_by: providerDef.id,
    }));
    await sb.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyRow.id);
    return json({ object: "list", data: staticData }, 200);
  }

  // Resolve upstream credentials the same way /v1/chat/completions does.
  let upstreamKey: string | null = null;
  if (keyRow.provider === "lovable") {
    upstreamKey = Deno.env.get("LOVABLE_API_KEY") || null;
  } else if (keyRow.provider_key_encrypted) {
    upstreamKey = await decryptString(keyRow.provider_key_encrypted);
  }

  let resolved;
  try { resolved = resolveEndpoint(keyRow as any, upstreamKey); }
  catch (e) {
    return errorResponse("openai", 500, e instanceof Error ? e.message : String(e), { code: "endpoint_resolution_failed" });
  }
  const modelsUrl = resolved.models_url;
  if (!modelsUrl) {
    return errorResponse("openai", 501, "This provider does not expose a models listing endpoint.", { code: "models_not_supported" });
  }

  let upstream: Response;
  try {
    upstream = await fetch(modelsUrl, { method: "GET", headers: resolved.headers });
  } catch (e) {
    return errorResponse("openai", 502, `Upstream fetch failed: ${e instanceof Error ? e.message : String(e)}`, { code: "upstream_unreachable" });
  }
  const text = await upstream.text();
  if (!upstream.ok) {
    return errorResponse("openai", upstream.status, `Upstream ${upstream.status}: ${text.slice(0, 500)}`, { code: "upstream_error" });
  }

  let raw: unknown;
  try { raw = JSON.parse(text); }
  catch {
    return errorResponse("openai", 502, "Upstream did not return JSON for the models listing.", { code: "upstream_invalid_json" });
  }

  // Normalize to OpenAI-spec shape regardless of upstream provider.
  const parsed = parseModelsResponse(raw);
  const nowSec = Math.floor(Date.now() / 1000);
  const data = parsed.models.map((m) => ({
    id: m.id,
    object: "model",
    created: nowSec,
    owned_by: m.owned_by ?? "anveguard",
    ...(m.display_name ? { display_name: m.display_name } : {}),
    ...(m.context_window != null ? { context_window: m.context_window } : {}),
  }));
  await sb.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyRow.id);
  return json({ object: "list", data }, 200);
}

async function handleRequest(req: Request): Promise<Response> {

  const start = Date.now();
  const sb = service();

  // Detect the public request shape from the URL path so the same proxy
  // can serve OpenAI, Anthropic, and Gemini SDKs unchanged.
  const reqUrl = new URL(req.url);
  const route = detectRequestShape(reqUrl);
  const reqShape: RequestShape = route.shape;

  // Phase 5 — recognised modality paths that DON'T have execution support
  // route to the dedicated handler (currently only image generation). Doing
  // this AFTER shape detection but BEFORE the chat-only auth/parse pipeline
  // keeps the handler self-contained.

  // ---- Auth: accept the AnveGuard key in whatever header the SDK sends, OR
  // a Clerk session token + `x-anveguard-key-id` for in-dashboard callers
  // (Playground). See resolveProxyKeyAuth for both paths.
  //   - OpenAI / generic:    Authorization: Bearer ag_live_…
  //   - Anthropic SDK:       x-api-key: ag_live_…
  //   - Google Gemini SDK:   ?key=ag_live_…
  //   - Dashboard session:   Authorization: Bearer <Clerk JWT> + x-anveguard-key-id
  const auth = await resolveProxyKeyAuth(
    sb, req,
    "id,user_id,provider,provider_key_encrypted,model_default,is_active,is_admin,compression_mode,custom_base_url,custom_models_url,custom_kind,custom_auth_scheme,custom_auth_header,custom_extra_headers,custom_path_prefix,custom_chat_path,custom_models_path,custom_response_format,spend_limit_usd,current_spend_usd,token_limit,current_token_spend,limit_window,limit_reset_at",
  );
  if (auth.error || !auth.keyRow) {
    return await rateLimitedAuthFailure(sb, req, reqShape,
      auth.error?.message ?? "Unauthorized",
      auth.error?.code ?? "invalid_api_key");
  }
  const keyRow = auth.keyRow;

  // Enforce Spend limits & Token Budgets
  const quota = checkApiKeyQuota(sb, keyRow, reqShape);
  if (!quota.allowed && quota.errorResponse) {
    return quota.errorResponse;
  }


  // Phase 5 — audio transcription. Body is multipart/form-data (file upload),
  // NOT JSON. Branch BEFORE the JSON parse so req.body is still readable as
  // a stream/buffer in the dedicated handler.
  if (reqShape === "openai_audio_transcription") {
    return await handleAudioTranscription(sb, req, keyRow);
  }

  // Body — parse, then translate to canonical OpenAI Chat Completions shape.
  // Every downstream component (policy, throttle, alias, route, upstream
  // dispatch, output evaluation) operates on the canonical shape; we only
  // translate back at the very end.
  let publicBody: any;
  try { publicBody = await req.json(); }
  catch { return errorResponse(reqShape, 400, "Invalid JSON body.", { code: "invalid_json" }); }

  // Phase 5 — image generation. Distinct path/body shape (OpenAI uses
  // /v1/images/generations with a `prompt` string, not `messages`). Run
  // input policy on the prompt then forward to upstream. Skips the chat-
  // specific pipeline (alias/route/streaming/output-policy) — those are
  // chat-only concepts. Only OpenAI-shaped providers supported in this
  // first pass; custom providers fall back to 501.
  if (reqShape === "openai_image") {
    return await handleImageGeneration(sb, req, keyRow, publicBody);
  }

  // Phase 5 — text-to-speech. JSON body { model, input, voice }; binary
  // response. Same input-policy + audit pipeline as image-gen, but the
  // upstream returns audio bytes that we passthrough unchanged.
  if (reqShape === "openai_audio_speech") {
    return await handleAudioSpeech(sb, req, keyRow, publicBody);
  }

  const body: any = translateRequestToOpenAI(reqShape, publicBody, route.pathModel);
  if (!Array.isArray(body?.messages) || body.messages.length === 0) {
    return errorResponse(reqShape, 400, "messages must be a non-empty array.", { code: "missing_messages", param: "messages" });
  }
  // Non-OpenAI shapes are served non-stream in this first pass; SDK consumers
  // get a single JSON response in their native format. OpenAI shape keeps
  // full streaming support unchanged.
  if (reqShape !== "openai") body.stream = false;
  let model: string = body.model || keyRow.model_default;
  const stream = !!body.stream;

  // ---- Alias rewrite (per API key) -----------------------------------------
  // If the requested model matches an alias, swap to the target_model and
  // (optionally) swap the resolved endpoint config to a user-owned endpoint.
  let aliasTargetEndpoint: any | null = null;
  if (model) {
    const { data: alias } = await sb.from("model_aliases")
      .select("target_model,target_endpoint_id")
      .eq("api_key_id", keyRow.id).eq("alias", String(model).toLowerCase())
      .maybeSingle();
    if (alias) {
      model = alias.target_model;
      if (alias.target_endpoint_id) {
        const { data: ep } = await sb.from("endpoints").select("*")
          .eq("id", alias.target_endpoint_id).eq("user_id", keyRow.user_id).maybeSingle();
        if (ep) aliasTargetEndpoint = ep;
      }
    }
  }

  // ---- Route resolution ----------------------------------------------------
  // `model: "route:<name>"` triggers fallback chain walking. Steps are tried
  // in order; we fall back on configured triggers (5xx, 429, timeout). Only
  // applies to non-stream and pre-stream errors — once bytes start flowing the
  // user sees the live response.
  type RouteStepResolved = {
    endpointRow: any;          // user-owned endpoint row
    model: string;
    upstreamKey: string | null;
  };
  let routeSteps: RouteStepResolved[] | null = null;
  let routeConfig: { fallback_on_5xx: boolean; fallback_on_429: boolean; fallback_on_timeout: boolean; timeout_ms: number } | null = null;
  if (typeof model === "string" && model.toLowerCase().startsWith("route:")) {
    const routeName = model.slice("route:".length).trim();
    const { data: route } = await sb.from("routes")
      .select("id,fallback_on_5xx,fallback_on_429,fallback_on_timeout,timeout_ms")
      .eq("user_id", keyRow.user_id).eq("name", routeName).maybeSingle();
    if (!route) return errorResponse(reqShape, 404, `Route not found: ${routeName}`, { code: "route_not_found", param: "model" });
    const { data: steps } = await sb.from("route_steps")
      .select("position,endpoint_id,model")
      .eq("route_id", route.id).order("position", { ascending: true });
    if (!steps || steps.length === 0) return errorResponse(reqShape, 500, `Route ${routeName} has no steps`, { code: "route_misconfigured" });
    const epIds = [...new Set(steps.map((s: any) => s.endpoint_id))];
    const { data: eps } = await sb.from("endpoints").select("*")
      .in("id", epIds).eq("user_id", keyRow.user_id);
    const epMap = new Map((eps ?? []).map((e: any) => [e.id, e]));
    routeSteps = [];
    for (const s of steps) {
      const ep = epMap.get(s.endpoint_id);
      if (!ep) continue;
      const k = ep.provider_key_encrypted ? await decryptString(ep.provider_key_encrypted) : null;
      routeSteps.push({ endpointRow: ep, model: s.model, upstreamKey: k });
    }
    if (routeSteps.length === 0) return errorResponse(reqShape, 500, `Route ${routeName} has no usable steps`, { code: "route_misconfigured" });
    routeConfig = {
      fallback_on_5xx: route.fallback_on_5xx,
      fallback_on_429: route.fallback_on_429,
      fallback_on_timeout: route.fallback_on_timeout,
      timeout_ms: route.timeout_ms,
    };
    // Initial model used by the downstream pipeline; will be overridden per step
    model = routeSteps[0].model;
  }

  const isCustom = keyRow.provider === "custom";
  const provider = isCustom ? null : getProvider(keyRow.provider);
  if (!isCustom && !provider) {
    return errorResponse(reqShape, 500, `Unknown provider: ${keyRow.provider}`, { code: "unknown_provider" });
  }

  // Resolve upstream credentials for the *default* (no-route) path.
  let upstreamKey: string | null = null;
  if (provider?.managed) {
    upstreamKey = Deno.env.get("LOVABLE_API_KEY") || null;
    if (!upstreamKey) return errorResponse(reqShape, 500, "LOVABLE_API_KEY not configured", { code: "upstream_not_configured" });
  } else if (keyRow.provider_key_encrypted) {
    upstreamKey = await decryptString(keyRow.provider_key_encrypted);
  } else if (!isCustom) {
    return errorResponse(reqShape, 500, `${provider!.label} key not stored`, { code: "upstream_key_missing" });
  }
  // For custom + auth_scheme === 'none', upstreamKey remains null which is fine.

  // Load workspace policy state (legacy + v2 layered).
  const policyState = await loadWorkspacePolicy(sb, keyRow.user_id);
  const { legacy, rules, intents, settings, blockMessage } = policyState;

  // ---- Workspace guardrail system prompt --------------------------------
  // If the workspace has configured a guardrail system prompt, prepend it as
  // a `system` message so it reaches the model on every request — regardless
  // of what the calling client sent. If the caller already supplied a system
  // message we keep theirs after the guardrail (the model treats the first
  // system message as the highest-priority instruction). Mutating `body.messages`
  // before evaluation also means the guardrail itself is included in
  // input/output policy checks and request logs, which is what operators want
  // when auditing.
  const guardrailRaw = (settings as any)?.guardrail_system_prompt;
  const injectedGuardrail = (typeof guardrailRaw === "string" && guardrailRaw.trim())
    ? guardrailRaw.trim() : null;
  const guardrail = guardrailRaw;
  if (injectedGuardrail) {
    body.messages = [
      { role: "system", content: injectedGuardrail },
      ...body.messages,
    ];
  }

  // ---- Caller-supplied custom system prompt -----------------------------
  // Clients may pass an optional top-level `system_prompt` (string). To prevent
  // a compromised client (or a careless integration) from silently overriding
  // the workspace guardrail, the field is gated by a per-key `is_admin` flag:
  //
  //   • Admin keys: the prompt is injected as a `system` message immediately
  //     AFTER the workspace guardrail and BEFORE the rest of the conversation.
  //     The guardrail still leads, so the model treats it as the highest-priority
  //     instruction; the admin prompt augments rather than replaces it.
  //   • Non-admin keys: any non-empty `system_prompt` is rejected with 403 so
  //     callers fail loudly instead of getting a quietly-stripped payload.
  //
  // The field is always stripped from `body` before forwarding upstream so
  // strict OpenAI-compat servers don't 400 on the unknown key.
  // Validation: reject obviously malformed inputs with OpenAI-style errors so
  // SDKs surface a clean `param: "system_prompt"` rather than a generic 500.
  const rawSystemPrompt = (body as any)?.system_prompt;
  const systemPromptMax = resolveSystemPromptMax((settings as any)?.system_prompt_max_length);
  const validation = validateSystemPrompt(rawSystemPrompt, systemPromptMax);
  // Helper: write a single audit_logs row capturing the system_prompt
  // override decision. Best-effort: a failed insert must never break the
  // user request. The metadata is intentionally compact so the Audit tab
  // can render it inline (no PII beyond the prompt length itself).
  const auditSystemPrompt = async (
    outcome: "allowed" | "rejected",
    detail: {
      gate?: "validation" | "workspace" | "key_admin";
      code?: string | null;
      reason?: string | null;
      length?: number;
    },
  ) => {
    try {
      await sb.from("audit_logs").insert({
        user_id: keyRow.user_id,
        actor_user_id: keyRow.user_id,
        action: outcome === "allowed"
          ? "system_prompt.allowed"
          : "system_prompt.rejected",
        target_type: "api_key",
        target_id: keyRow.id,
        metadata: {
          outcome,
          gate: detail.gate ?? null,
          code: detail.code ?? null,
          reason: detail.reason ?? null,
          prompt_length: detail.length ?? null,
          model: model ?? null,
          is_admin_key: !!keyRow.is_admin,
          workspace_allows: (settings as any)?.allow_client_system_prompt === true,
          max_length: systemPromptMax,
        },
      });
    } catch { /* swallow — auditing must not break the request path */ }
  };

  if (validation.error) {
    // Use the stable per-failure code from the validator (e.g.
    // "system_prompt_too_long") so SDKs can branch precisely instead of
    // string-matching the message.
    await auditSystemPrompt("rejected", {
      gate: "validation",
      code: validation.code,
      reason: validation.error,
      length: typeof rawSystemPrompt === "string" ? rawSystemPrompt.length : 0,
    });
    return errorResponse(reqShape, 400, validation.error, {
      code: validation.code,
      param: "system_prompt",
      doc_url: SYSTEM_PROMPT_DOC_URL,
    });
  }
  const customSystemPrompt = validation.value;
  if (customSystemPrompt) {
    // Single source of truth for the (workspace × key_admin) decision matrix
    // — see `decideSystemPromptGate` for the full table. Keeping the logic
    // in _shared lets unit tests cover all 4 combinations without spinning
    // up the full proxy.
    const decision = decideSystemPromptGate({
      workspaceAllows: (settings as any)?.allow_client_system_prompt === true,
      keyIsAdmin: !!keyRow.is_admin,
    });
    if (!decision.allowed) {
      const reason = decision.gate === "workspace"
        ? "Workspace policy disallows per-request system_prompt overrides."
        : "API key lacks the admin permission required to inject a custom system_prompt.";
      const userMessage = decision.gate === "workspace"
        ? "Per-request `system_prompt` overrides are disabled for this workspace. Ask a workspace admin to enable them under Policies → Guardrails, or remove the `system_prompt` field from the request body."
        : "This API key is not permitted to send a custom `system_prompt`. Ask a workspace admin to grant the admin permission to this key on the Keys page, or remove the `system_prompt` field from the request body.";
      await auditSystemPrompt("rejected", {
        gate: decision.gate,
        code: decision.code,
        reason,
        length: customSystemPrompt.length,
      });
      return errorResponse(reqShape, decision.status, userMessage, {
        code: decision.code,
        param: "system_prompt",
        doc_url: SYSTEM_PROMPT_DOC_URL,
      });
    }
    const insertAt = (typeof guardrail === "string" && guardrail.trim()) ? 1 : 0;
    body.messages = [
      ...body.messages.slice(0, insertAt),
      { role: "system", content: customSystemPrompt },
      ...body.messages.slice(insertAt),
    ];
    await auditSystemPrompt("allowed", {
      code: "system_prompt_accepted",
      length: customSystemPrompt.length,
    });
  }
  if ("system_prompt" in (body as any)) {
    delete (body as any).system_prompt;
  }

  const systemPrompt = extractSystemPrompt(body.messages);
  const toolsRequested = Array.isArray(body.tools) && body.tools.length > 0;

  // Flatten the prompt for evaluation. Note: original payload is forwarded as-is.
  const promptText = body.messages.map((msg: any) =>
    typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content ?? "")).join("\n");

  // ---- Throttle check ---------------------------------------------------
  // Per-API-key risk window: count flag/block verdicts in the recent window.
  // Threshold of 0 = disabled. We do this BEFORE the (possibly LLM-backed)
  // policy evaluation so abusive keys can't run up our intent-classifier bill.
  //
  // Exponential backoff: each prior `throttled` event for this key inside the
  // window doubles the cool-down (60s base, capped at the full window). While
  // a key is in cool-down we deny with 429 + Retry-After. Once the key clears
  // both the cool-down AND drops back below the risky-request threshold, it
  // resumes normal traffic.
  const throttleThreshold = settings.throttle_flag_threshold ?? 0;
  const throttleWindowMin = settings.throttle_window_minutes ?? 5;
  if (throttleThreshold > 0) {
    const windowMs = throttleWindowMin * 60_000;
    const sinceIso = new Date(Date.now() - windowMs).toISOString();

    // Pull both signals in parallel: the rolling risky-count and the most
    // recent throttle event (with the running streak count) for backoff.
    const [riskyRes, throttleRes] = await Promise.all([
      sb.from("request_logs")
        .select("id", { count: "exact", head: true })
        .eq("api_key_id", keyRow.id)
        .in("verdict", ["flag", "block"])
        .gte("created_at", sinceIso),
      sb.from("request_logs")
        .select("created_at", { count: "exact" })
        .eq("api_key_id", keyRow.id)
        .eq("status", "throttled")
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(1),
    ]);

    const riskyCount = riskyRes.count ?? 0;
    const throttledCount = throttleRes.count ?? 0;
    const lastThrottleAt = throttleRes.data?.[0]?.created_at
      ? Date.parse(throttleRes.data[0].created_at) : 0;

    // Cool-down doubles per prior throttle: 60s, 2m, 4m, 8m, ... capped at
    // the configured window so a single bad burst can't lock the key out
    // beyond the operator's risk window.
    const BACKOFF_BASE_MS = 60_000;
    const backoffMs = Math.min(
      BACKOFF_BASE_MS * Math.pow(2, throttledCount),
      windowMs,
    );
    const remainingCooldownMs = lastThrottleAt
      ? Math.max(0, lastThrottleAt + backoffMs - Date.now()) : 0;

    const overThreshold = riskyCount >= throttleThreshold;
    const inCooldown = remainingCooldownMs > 0;

    if (overThreshold || inCooldown) {
      const retryAfterSec = Math.max(
        1,
        Math.ceil((inCooldown ? remainingCooldownMs : backoffMs) / 1000),
      );
      const reason = inCooldown
        ? `Throttled: backoff active (${throttledCount} prior throttle${throttledCount === 1 ? "" : "s"} in ${throttleWindowMin} min). Retry in ${retryAfterSec}s.`
        : `Throttled: ${riskyCount} risky requests in the last ${throttleWindowMin} min (threshold ${throttleThreshold}). Retry in ${retryAfterSec}s.`;

      await insertRequestLog(sb, {
        user_id: keyRow.user_id, api_key_id: keyRow.id, provider: keyRow.provider,
        model, messages: body.messages,
        // Throttle fires before the intent classifier runs, so we record
        // "unknown" rather than leaving the audit field null.
        detected_intent: "unknown",
        guardrail_prompt: injectedGuardrail,
        client_system_prompt: customSystemPrompt || null,
        status: "throttled", verdict: "block", block_reason: reason,
        verdict_layers: [{
          layer: "behavioral", verdict: "block", rule: "throttle",
          reason,
          // Surface the backoff state for observability / dashboard.
          matched: JSON.stringify({
            risky_count: riskyCount,
            prior_throttles: throttledCount,
            backoff_ms: backoffMs,
            retry_after_sec: retryAfterSec,
          }),
        }],
        latency_ms: Date.now() - start, tokens_in: 0, tokens_out: 0,
      }, settings);
      return errorResponse(reqShape, 429, reason, {
        code: "rate_limit_exceeded",
        headers: { "Retry-After": String(retryAfterSec) },
        anveguard: {
          throttled: true, reason,
          retry_after_sec: retryAfterSec,
          backoff_ms: backoffMs,
          prior_throttles: throttledCount,
        },
      });
    }
  }

  // ---- Layered input evaluation -----------------------------------------
  const inputEval: EvaluateResult = await evaluatePolicy(
    { text: promptText, direction: "input", legacy, rules, intents, settings, conversation: body.messages },
    { systemPrompt, toolsRequested },
  );

  // ---- XPIA / retrieved-content scan ------------------------------------
  // Indirect-injection scan on tool-role / function-role messages — these
  // carry retrieved content (RAG chunks, MCP tool replies, function call
  // results) that didn't come from the user. We apply stricter verdicts
  // here than to user-direct content per the EchoLeak (CVE-2025-32711)
  // asymmetry: "ignore previous" inside retrieved bytes has essentially
  // no legitimate use case. Any block-verdict from this scan upgrades the
  // overall verdict to block, short-circuits the upstream call, and is
  // attributed in the audit log with rule= one of the retrieved_* names.
  const retrievedLayers: LayerVerdict[] = [];
  for (const msg of body.messages ?? []) {
    if (msg?.role !== "tool" && msg?.role !== "function") continue;
    const content = typeof msg.content === "string"
      ? msg.content
      : JSON.stringify(msg.content ?? "");
    if (!content || content.length === 0) continue;
    const verdicts = evaluateRetrieved(content, {
      kind: "mcp_tool_result",
      origin: typeof msg.tool_call_id === "string" ? msg.tool_call_id :
              typeof msg.name === "string" ? msg.name : undefined,
    });
    retrievedLayers.push(...verdicts);
  }
  if (retrievedLayers.length > 0) {
    inputEval.layers.push(...retrievedLayers);
    if (retrievedLayers.some((l) => l.verdict === "block")) {
      inputEval.verdict = "block";
    } else if (retrievedLayers.some((l) => l.verdict === "flag") &&
               inputEval.verdict === "allow") {
      inputEval.verdict = "flag";
    }
  }

  // Every proxied call records the detected intent (or `"unknown"` when the
  // intent classifier is disabled, in shadow mode, or returned no match).
  // Surfacing this on every log lets operators audit *why* an intent-scoped
  // rule did or didn't fire — a missing intent is a real, common reason.
  const logBase: any = {
    user_id: keyRow.user_id,
    api_key_id: keyRow.id,
    provider: keyRow.provider,
    model,
    messages: body.messages,
    detected_intent: inputEval.detected_intent ?? "unknown",
    intent_confidence: inputEval.intent_confidence ?? null,
    // Audit trail for system-prompt injection: persist exactly what the proxy
    // prepended to the conversation so reviewers can reconstruct the prompt
    // chain without re-deriving it from `messages`.
    guardrail_prompt: injectedGuardrail,
    client_system_prompt: customSystemPrompt || null,
  };

  if (inputEval.verdict === "block") {
    const reason = inputEval.layers.find((l) => l.verdict === "block")?.reason ?? "Blocked by policy";
    const responsePayload = {
      id: `chatcmpl-blocked-${crypto.randomUUID()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [{ index: 0, finish_reason: "content_filter",
        message: { role: "assistant", content: blockMessage } }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      anveguard: { blocked: true, reason, layers: inputEval.layers },
    };
    await insertRequestLog(sb, {
      ...logBase, status: "blocked_input", block_reason: reason,
      verdict: "block", verdict_layers: inputEval.layers,
      response: responsePayload, latency_ms: Date.now() - start,
      tokens_in: 0, tokens_out: 0,
    }, settings);
    await sb.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyRow.id);
    // If the caller asked for SSE, deliver the block as a synthetic stream so
    // OpenAI SDKs that iterate the stream finish cleanly instead of hanging.
    if (stream && reqShape === "openai") {
      return new Response(buildSyntheticSseStream({
        model, content: blockMessage, finishReason: "content_filter",
        anveguard: { blocked: true, reason, layers: inputEval.layers },
      }), { headers: sseHeaders });
    }
    return json(translateResponseFromOpenAI(reqShape, responsePayload), 200);
  }

  // Sanitize action: rewrite each message's content independently (we can't
  // use the flattened promptText spans because indices don't map back to
  // individual messages once joined). Original payload object is mutated in
  // place — every downstream attempt forwards the redacted version.
  let sanitizationApplied = false;
  if (inputEval.verdict === "sanitize") {
    for (const msg of body.messages) {
      const original = typeof msg.content === "string" ? msg.content : null;
      if (!original) continue; // skip non-string content (multimodal, tool calls)
      const norm = original.toLowerCase(); // cheap; engine normalizer is heavier but injection regex is case-insensitive
      const layers = evaluateInjection(original, norm, "input");
      const spans = layers.flatMap((l) => l.spans ?? []);
      if (spans.length > 0) {
        msg.content = applySanitization(original, spans);
        sanitizationApplied = true;
      }
    }
    logBase.messages = body.messages; // log the sanitized version
  }

  // ---- Token compression --------------------------------------------------
  // Reduce upstream prompt size (and cost) without an extra LLM call.
  // Workspace toggle + per-key override (`inherit | off | light | balanced | aggressive`).
  // System and tool messages are never touched.
  try {
    const { compressMessages } = await import("../_shared/compress.ts");
    const wsEnabled = (settings as any)?.enable_compression === true;
    const wsLevel = ((settings as any)?.compression_level ?? "balanced") as
      "light" | "balanced" | "aggressive";
    const minChars = Number((settings as any)?.compression_min_chars ?? 400);
    const keyMode = String(keyRow.compression_mode ?? "inherit");
    const effective: "off" | "light" | "balanced" | "aggressive" =
      keyMode === "off" ? "off" :
      keyMode === "inherit" ? (wsEnabled ? wsLevel : "off") :
      (keyMode as any);
    const totalChars = body.messages.reduce(
      (n: number, m: any) => n + (typeof m?.content === "string" ? m.content.length : 0), 0,
    );
    if (effective !== "off" && totalChars >= minChars) {
      const r = compressMessages(body.messages, effective);
      if (r.estimatedTokensSaved > 0) {
        body.messages = r.messages;
        logBase.messages = body.messages;
        logBase.compression_applied = true;
        logBase.tokens_saved_estimate = r.estimatedTokensSaved;
      }
    }
  } catch (e) {
    console.error("compression failed (non-fatal):", e);
  }

  // ---- Build attempt list -------------------------------------------------
  // Each attempt is (synthetic keyRow shape, model, upstreamKey). For routes
  // we get N attempts in priority order; for the non-route path it's exactly
  // one attempt, optionally swapped to alias_target_endpoint.
  type Attempt = { keyRowLike: any; model: string; upstreamKey: string | null; label: string };
  const endpointToKeyRowShape = (ep: any): any => ({
    provider: "custom",
    custom_base_url: ep.base_url,
    custom_models_url: ep.models_url,
    custom_kind: ep.kind,
    custom_auth_scheme: ep.auth_scheme,
    custom_auth_header: ep.auth_header,
    custom_extra_headers: ep.extra_headers ?? {},
    custom_path_prefix: ep.path_prefix,
    custom_chat_path: ep.chat_path,
    custom_models_path: ep.models_path,
    custom_response_format: ep.response_format,
  });

  let attempts: Attempt[];
  if (routeSteps && routeConfig) {
    attempts = routeSteps.map((s) => ({
      keyRowLike: endpointToKeyRowShape(s.endpointRow),
      model: s.model,
      upstreamKey: s.upstreamKey,
      label: `route step → ${s.endpointRow.name}`,
    }));
  } else if (aliasTargetEndpoint) {
    const k = aliasTargetEndpoint.provider_key_encrypted
      ? await decryptString(aliasTargetEndpoint.provider_key_encrypted)
      : null;
    attempts = [{
      keyRowLike: endpointToKeyRowShape(aliasTargetEndpoint),
      model,
      upstreamKey: k,
      label: `alias → ${aliasTargetEndpoint.name}`,
    }];
  } else {
    attempts = [{ keyRowLike: keyRow, model, upstreamKey, label: "default" }];
  }

  // ---- Try attempts in order ----------------------------------------------
  let upstream: Response | null = null;
  let forwardFormat: "chat_completions" | "responses" | "anthropic_messages" = "chat_completions";
  let lastErrorReason = "";
  let lastErrorStatus = 502;
  let chosenModel = model;

  for (let i = 0; i < attempts.length; i++) {
    const a = attempts[i];
    let resolved;
    try {
      resolved = resolveEndpoint(a.keyRowLike, a.upstreamKey);
    } catch (e) {
      lastErrorReason = `Endpoint resolution failed (${a.label}): ${e instanceof Error ? e.message : String(e)}`;
      lastErrorStatus = 500;
      if (routeConfig && i < attempts.length - 1) continue;
      break;
    }
    forwardFormat = resolved.response_format;
    const forwardHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...resolved.headers,
    };
    chosenModel = a.model;
    // Provider-specific model id rewriting (e.g. Perplexity expects "sonar"
    // not "perplexity/sonar"). Applied transparently so clients can paste
    // either form.
    const forwardModel = resolved.normalize_model ? resolved.normalize_model(a.model) : a.model;

    let forwardBody: any;
    if (forwardFormat === "anthropic_messages") {
      forwardBody = openaiToAnthropicRequest({ ...body, model: forwardModel });
    } else if (forwardFormat === "responses") {
      forwardBody = chatToResponsesRequest({ ...body, model: forwardModel, stream });
    } else {
      forwardBody = { ...body, model: forwardModel, stream };
    }

    const ctrl = new AbortController();
    const timeoutMs = routeConfig?.timeout_ms ?? 0;
    const tid = timeoutMs > 0 ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
    let resp: Response;
    try {
      resp = await fetch(resolved.url, {
        method: "POST", headers: forwardHeaders,
        body: JSON.stringify(forwardBody),
        signal: ctrl.signal,
      });
    } catch (e) {
      if (tid) clearTimeout(tid);
      const isAbort = e instanceof Error && (e.name === "AbortError" || /abort|timeout/i.test(e.message));
      lastErrorReason = `Upstream fetch failed (${a.label}): ${isAbort ? "timeout" : (e instanceof Error ? e.message : String(e))}`;
      lastErrorStatus = 502;
      const canFallback = !!routeConfig && (
        (isAbort && routeConfig.fallback_on_timeout) ||
        (!isAbort && routeConfig.fallback_on_5xx)
      );
      if (canFallback && i < attempts.length - 1) continue;
      await insertRequestLog(sb, {
        ...logBase, model: chosenModel, status: "error", block_reason: lastErrorReason,
        latency_ms: Date.now() - start,
      }, settings);
      return errorResponse(reqShape, lastErrorStatus, lastErrorReason, { code: lastErrorStatus === 504 ? "upstream_timeout" : "upstream_unreachable" });
    }
    if (tid) clearTimeout(tid);

    if (!resp.ok) {
      const text = await resp.text();
      lastErrorReason = `Upstream ${resp.status} (${a.label}): ${text.slice(0, 500)}`;
      lastErrorStatus = resp.status;
      const is5xx = resp.status >= 500 && resp.status <= 599;
      const is429 = resp.status === 429;
      const canFallback = !!routeConfig && (
        (is5xx && routeConfig.fallback_on_5xx) ||
        (is429 && routeConfig.fallback_on_429)
      );
      if (canFallback && i < attempts.length - 1) continue;
      await insertRequestLog(sb, {
        ...logBase, model: chosenModel, status: "error", block_reason: lastErrorReason,
        latency_ms: Date.now() - start,
      }, settings);
      // Pass-through OpenAI-shape upstream errors verbatim (the upstream
      // already used the OpenAI envelope) so SDK error handlers see exactly
      // what they expect. For other shapes, translate.
      if (reqShape !== "openai") {
        return errorResponse(reqShape, resp.status, lastErrorReason, { code: "upstream_error" });
      }
      return new Response(text, {
        status: resp.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    upstream = resp;
    break;
  }

  if (!upstream) {
    await insertRequestLog(sb, {
      ...logBase, status: "error", block_reason: lastErrorReason || "All route attempts failed",
      latency_ms: Date.now() - start,
    }, settings);
    return errorResponse(reqShape, lastErrorStatus, lastErrorReason || "All route attempts failed", { code: "all_attempts_failed" });
  }

  // Reflect what actually ran in subsequent code paths and logs.
  (logBase as any).model = chosenModel;
  model = chosenModel;



  // ===== Streaming =====
  if (stream && upstream.body) {
    if (forwardFormat === "anthropic_messages") {
      const { stream: oaiStream, done } = anthropicStreamToOpenAI(upstream.body, model);
      done.then(async ({ assistantText, usage }) => {
        const out = await evaluateOutput(assistantText, policyState, { systemPrompt, toolsRequested });
        const promptTokens = usage?.prompt_tokens ?? approximateTokens(promptText);
        const completionTokens = usage?.completion_tokens ?? approximateTokens(assistantText);
        const costUsd = calculateEstimatedCost(model, promptTokens, completionTokens);

        await insertRequestLog(sb, {
          ...logBase, status: out.status, block_reason: out.blockReason,
          verdict: out.status === "blocked_output" ? "block" : "allow",
          verdict_layers: out.layers,
          response: { streamed: true, content: assistantText },
          latency_ms: Date.now() - start,
          tokens_in: promptTokens,
          tokens_out: completionTokens,
        }, settings);

        await incrementSpendsAtomic(sb, keyRow.id, costUsd, promptTokens + completionTokens);
        await sb.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyRow.id);
      });
      return new Response(oaiStream, { headers: sseHeaders });
    }

    if (forwardFormat === "responses") {
      const { stream: oaiStream, done } = responsesStreamToChat(upstream.body, model);
      done.then(async ({ assistantText, usage, finalModel }) => {
        const out = await evaluateOutput(assistantText, policyState, { systemPrompt, toolsRequested });
        const promptTokens = usage?.prompt_tokens ?? approximateTokens(promptText);
        const completionTokens = usage?.completion_tokens ?? approximateTokens(assistantText);
        const costUsd = calculateEstimatedCost(finalModel, promptTokens, completionTokens);

        await insertRequestLog(sb, {
          ...logBase, model: finalModel, status: out.status, block_reason: out.blockReason,
          verdict: out.status === "blocked_output" ? "block" : "allow",
          verdict_layers: out.layers,
          response: { streamed: true, content: assistantText },
          latency_ms: Date.now() - start,
          tokens_in: promptTokens,
          tokens_out: completionTokens,
        }, settings);

        await incrementSpendsAtomic(sb, keyRow.id, costUsd, promptTokens + completionTokens);
        await sb.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyRow.id);
      });
      return new Response(oaiStream, { headers: sseHeaders });
    }

    // OpenAI-compatible passthrough w/ tap.
    //
    // We forward upstream SSE bytes line-by-line so we can:
    //   1. accumulate `assistantText` for the output policy evaluation,
    //   2. drop the upstream `[DONE]` sentinel and emit our own AFTER
    //      appending an optional `content_filter` trailer if output policy
    //      blocked the completed text,
    //   3. capture mid-stream upstream errors and surface them as a final
    //      SSE chunk so SDK consumers don't see a silent close.
    let buffered = "";
    let assistantText = "";
    let finalUsage: any = null;
    let finalModel = model;
    let streamFailure: string | null = null;
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();

    let streamBlocked = false;

    const transformed = new ReadableStream({
      async start(controller) {
        const reader = upstream.body!.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffered += decoder.decode(value, { stream: true });
            // Re-emit complete lines; preserve partial trailing line in buffer.
            let nl;
            let blocked = false;
            while ((nl = buffered.indexOf("\n")) !== -1) {
              const rawLine = buffered.slice(0, nl + 1); // include the \n
              buffered = buffered.slice(nl + 1);
              const trimmed = rawLine.trim();
              if (trimmed.startsWith("data:")) {
                const payload = trimmed.slice(5).trim();
                if (payload === "[DONE]") {
                  // Swallow upstream sentinel; we'll write our own at the end.
                  continue;
                }
                try {
                  const obj = JSON.parse(payload);
                  const delta = obj?.choices?.[0]?.delta?.content;
                  if (typeof delta === "string") {
                    assistantText += delta;
                    
                    // Evaluate policy mid-stream on accumulated text!
                    if (assistantText.length > 0) {
                      const out = await evaluateOutput(assistantText, policyState, { systemPrompt, toolsRequested });
                      if (out.status === "blocked_output") {
                        blocked = true;
                        streamBlocked = true;
                        
                        // Abort upstream reader immediately
                        try { await reader.cancel(); } catch { /* noop */ }
                        
                        // Enqueue synthetic block chunk
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                          id: `chatcmpl-${crypto.randomUUID()}`,
                          object: "chat.completion.chunk",
                          created: Math.floor(Date.now() / 1000),
                          model: finalModel,
                          choices: [{ index: 0, delta: { content: `\n\n${blockMessage}` }, finish_reason: "content_filter" }],
                          anveguard: { blocked: true, reason: out.blockReason, layers: out.layers },
                        })}\n\n`));
                        
                        controller.enqueue(SSE_DONE);
                        
                        // Log blocked request and spent limits atomically
                        const promptTokens = finalUsage?.prompt_tokens ?? approximateTokens(promptText);
                        const completionTokens = finalUsage?.completion_tokens ?? approximateTokens(assistantText);
                        const costUsd = calculateEstimatedCost(finalModel, promptTokens, completionTokens);
                        
                        await insertRequestLog(sb, {
                          ...logBase, model: finalModel,
                          status: "blocked_output",
                          block_reason: out.blockReason,
                          verdict: "block",
                          verdict_layers: out.layers,
                          response: { streamed: true, content: assistantText, blocked: true },
                          latency_ms: Date.now() - start,
                          tokens_in: promptTokens,
                          tokens_out: completionTokens,
                        }, settings);
                        
                        await incrementSpendsAtomic(sb, keyRow.id, costUsd, promptTokens + completionTokens);
                        break;
                      }
                    }
                  }
                  if (obj?.usage) finalUsage = obj.usage;
                  if (obj?.model) finalModel = obj.model;
                } catch { /* partial JSON, just forward */ }
              }
              controller.enqueue(encoder.encode(rawLine));
            }
            if (blocked) {
              controller.close();
              return;
            }
          }
          // Flush any trailing bytes (no newline).
          if (buffered.length > 0) {
            controller.enqueue(encoder.encode(buffered));
            buffered = "";
          }
        } catch (e) {
          streamFailure = e instanceof Error ? e.message : String(e);
          controller.enqueue(sseEncode(openaiErrorShape(
            `Upstream stream interrupted: ${streamFailure}`,
            "api_error",
            { code: "upstream_stream_error" },
          )));
        } finally {
          // If already blocked mid-stream, bypass finally logging
          if (!streamBlocked) {
            // Run output policy on the accumulated text. If it blocks, emit a
            // synthetic content_filter chunk so the client knows the answer was
            // suppressed
            const out = await evaluateOutput(assistantText, policyState, { systemPrompt, toolsRequested });
            if (out.status === "blocked_output") {
              controller.enqueue(sseEncode({
                id: `chatcmpl-${crypto.randomUUID()}`,
                object: "chat.completion.chunk",
                created: Math.floor(Date.now() / 1000),
                model: finalModel,
                choices: [{ index: 0, delta: { content: `\n\n${blockMessage}` }, finish_reason: "content_filter" }],
                anveguard: { blocked: true, reason: out.blockReason, layers: out.layers },
              }));
            }
            controller.enqueue(SSE_DONE);
            controller.close();

            const promptTokens = finalUsage?.prompt_tokens ?? approximateTokens(promptText);
            const completionTokens = finalUsage?.completion_tokens ?? approximateTokens(assistantText);
            const costUsd = calculateEstimatedCost(finalModel, promptTokens, completionTokens);

            await insertRequestLog(sb, {
              ...logBase, model: finalModel,
              status: streamFailure ? "error" : out.status,
              block_reason: streamFailure ?? out.blockReason,
              verdict: out.status === "blocked_output" ? "block" : "allow",
              verdict_layers: out.layers,
              response: { streamed: true, content: assistantText, ...(streamFailure ? { error: streamFailure } : {}) },
              latency_ms: Date.now() - start,
              tokens_in: promptTokens,
              tokens_out: completionTokens,
            }, settings);
            
            await incrementSpendsAtomic(sb, keyRow.id, costUsd, promptTokens + completionTokens);
          }
        }
      },
      cancel(reason) {
        // Client disconnected; abort the upstream read so we don't leak.
        try { upstream.body?.cancel(reason); } catch { /* noop */ }
      },
    });
    return new Response(transformed, { headers: sseHeaders });
  }

  // ===== Non-streaming =====
  const rawData = await upstream.json();
  const data =
    forwardFormat === "anthropic_messages" ? anthropicToOpenAIResponse(rawData) :
    forwardFormat === "responses" ? responsesToChatResponse(rawData, model) :
    rawData;
  const assistantText = data?.choices?.[0]?.message?.content ?? "";
  const outEval = typeof assistantText === "string"
    ? await evaluateOutput(assistantText, policyState, { systemPrompt, toolsRequested })
    : { status: "allowed" as const, blockReason: null, layers: [] as any[] };

  let finalResponse = data;
  const status = outEval.status;
  const blockReason = outEval.blockReason;

  if (status === "blocked_output") {
    finalResponse = {
      ...data,
      choices: [{
        ...(data.choices?.[0] ?? {}),
        finish_reason: "content_filter",
        message: { role: "assistant", content: blockMessage },
      }],
      anveguard: { blocked: true, reason: blockReason, layers: outEval.layers },
    };
  }

  const promptTokens = data?.usage?.prompt_tokens ?? approximateTokens(promptText);
  const completionTokens = data?.usage?.completion_tokens ?? approximateTokens(assistantText);
  const costUsd = calculateEstimatedCost(data?.model || model, promptTokens, completionTokens);

  await insertRequestLog(sb, {
    ...logBase, model: data?.model || model, status, block_reason: blockReason,
    verdict: status === "blocked_output" ? "block" : "allow",
    verdict_layers: outEval.layers,
    response: finalResponse, latency_ms: Date.now() - start,
    tokens_in: promptTokens,
    tokens_out: completionTokens,
  }, settings);

  await incrementSpendsAtomic(sb, keyRow.id, costUsd, promptTokens + completionTokens);
  await sb.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyRow.id);

  return json(translateResponseFromOpenAI(reqShape, finalResponse), 200);
}
