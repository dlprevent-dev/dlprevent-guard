## Goal

Make sure the AnveGuard API key works for any third-party OpenAI-compatible client (curl, OpenAI SDK, Anthropic SDK, Gemini SDK, Cursor, OpenWebUI, etc.) end-to-end: auth in every standard header slot, valid streaming + non-streaming responses, OpenAI-spec error envelopes, and a smoke test that re-runs on demand.

The proxy already covers most of this — what's missing is **verified evidence it works** and a **repeatable smoke test**. This plan does an audit pass, fixes anything off-spec, then proves it with a live test against the deployed function.

## 1. Compatibility audit (read-only)

Walk each surface and check against the OpenAI spec / known SDK expectations. Items confirmed already-correct stay untouched; only gaps get fixed.

| Surface | Spec expectation | What we check |
|---|---|---|
| `Authorization: Bearer ag_live_…` | OpenAI / Cursor / OpenWebUI | `resolveProxyKeyAuth` path A — confirmed ✓ |
| `x-api-key: ag_live_…` | Anthropic SDK | path A — confirmed ✓ |
| `?key=ag_live_…` | Gemini SDK | path A — confirmed ✓ |
| `POST /v1/chat/completions` non-stream | `{id, object:"chat.completion", choices:[{message, finish_reason}], usage}` | spot-check response builder |
| `POST /v1/chat/completions` stream=true | `text/event-stream`, frames `data: {...}\n\n`, terminator `data: [DONE]\n\n`, each chunk `object:"chat.completion.chunk"`, role-only first delta, content deltas, final `finish_reason` chunk | inspect SSE pipeline (lines ~700–1730) |
| `stream_options: {include_usage:true}` | extra final chunk with `usage` | confirm passthrough (currently usage is captured but check the chunk shape) |
| `tool_calls` / function calling | passthrough untouched | confirm not stripped by policy/compression |
| `GET /v1/models` | `{object:"list", data:[{id, object:"model", owned_by}]}` | confirm `parseModelsResponse` normalises Anthropic/Gemini upstreams |
| `GET /healthz` | 200 JSON | confirmed ✓ |
| Error envelope | `{error:{message,type,param,code}}`, `type` in OpenAI's enum | spot-check `typeForStatus` mapping |
| CORS | `OPTIONS` returns 200 + permissive headers | confirmed ✓ |
| 401 / 429 headers | `Retry-After` on 429 | confirmed for auth-fail RL; check elsewhere |
| Trailing slash + case-insensitive headers | both work | confirmed ✓ in regex |

Likely gaps to look for (will only fix if they're real):

- `stream_options.include_usage` may not emit the OpenAI-spec final usage chunk shape.
- Content-filter early-exit currently emits `usage: {0,0,0}`; OpenAI spec is fine with this, but verify the `choices[0].message` field is present on non-stream and `choices[0].delta` on stream.
- `/v1/models` may be missing `created` (int seconds since epoch) — OpenAI clients ignore it but some validators fail.
- `error.type` for some 400s currently returns `"api_error"` instead of `"invalid_request_error"` — covered by `typeForStatus` already, but double-check call sites that pass explicit `type`.
- Anthropic-shape upstream errors should pass through with original status, not collapse to 500.

## 2. Fixes (only what the audit flags)

Each fix is a small surgical edit to `supabase/functions/proxy/index.ts` or `supabase/functions/_shared/shape_translators.ts`. I'll keep the existing behavior for everything that already conforms.

Anticipated edits (worst case):

1. Add `created: Math.floor(Date.now()/1000)` to each `/v1/models` entry.
2. When `stream_options.include_usage === true`, emit a final `{choices: [], usage}` SSE chunk before `[DONE]`.
3. Make sure the helper that synthesises blocked-output completions includes a non-empty `id` and a valid `created` field on both streaming and non-streaming paths.

If the audit finds zero gaps, this section is a no-op.

## 3. Repeatable smoke test

New file: `supabase/functions/proxy/openai_compat_smoke.ts` (Deno script, not part of the test runner — runnable via `deno run --allow-net --allow-env supabase/functions/proxy/openai_compat_smoke.ts`).

Reads `ANVEGUARD_KEY` and `PROXY_BASE_URL` (defaults to deployed URL) from env. Runs these cases and prints a pass/fail table:

- `GET /healthz` → 200
- `GET /v1/models` with Bearer key → `object:"list"`, non-empty `data`
- `GET /v1/models` with no key → 401 with `error.code === "missing_api_key"`
- `GET /v1/models` with bogus key → 401 with `error.code === "invalid_api_key"`
- `GET /v1/models` with `x-api-key` header → 200 (Anthropic-style auth slot)
- `GET /v1/models?key=ag_live_…` → 200 (Gemini-style auth slot)
- `POST /v1/chat/completions` non-stream, single user message → `choices[0].message.content` non-empty, `usage.total_tokens > 0`
- `POST /v1/chat/completions` stream → first frame has `delta.role`, later frames have `delta.content`, terminator `data: [DONE]`
- `POST /v1/chat/completions` with `stream_options.include_usage` → final pre-DONE frame has `usage`
- `POST /v1/chat/completions` missing `messages` → 400 with `error.type === "invalid_request_error"`
- `POST /v1/chat/completions` with a clearly blocked prompt (configured in test key's policy) → 200 with `finish_reason === "content_filter"` (not a 4xx)
- `POST /v1/messages` (Anthropic shape) with `x-api-key` → 200, Anthropic-shape response
- `OPTIONS /v1/chat/completions` → 200 with CORS headers
- Confirms `last_used_at` on the key row was bumped (via dashboard `read_query`)

## 4. Live verification

In this loop:

1. Look up a real `ag_live_…` key (`read_query` on `api_keys` for a test user, or create one via dashboard) — or, if you'd rather not expose a live key, I'll use the dashboard-session auth path with the current preview JWT against a known key id.
2. Run the smoke test via `code--exec` using `deno run` or via `supabase--curl_edge_functions` for the cases that don't need streaming. Streaming cases run through `curl --no-buffer` in the sandbox.
3. Report a pass/fail table in chat with status codes and headers for any failure.

## 5. Out of scope

- No new SDKs / connectors.
- No new pricing / billing surfaces.
- No changes to dashboard UI, Playground, Connect page — they already render the correct base URL.
- Custom domain (`anveguard.app/v1` in docs) — not touched; the proxy works on either host.
- Image generation, audio speech/transcription endpoints — already wired up; not in this pass unless the audit surfaces a clear bug.

## Files touched (expected)

- `supabase/functions/proxy/index.ts` — at most 1–3 small fixes from the audit.
- `supabase/functions/_shared/shape_translators.ts` — possibly 1 small fix.
- `supabase/functions/proxy/openai_compat_smoke.ts` — new smoke test runner.

If the audit comes back clean, only the smoke-test file is added.
