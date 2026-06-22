// AnveGuard dashboard API. Authenticates with a Clerk session JWT and exposes
// CRUD for keys, policies, logs, and stats. Single function with action routing.
import { dashboardCorsHeaders, applyDashboardCors, json, service, verifyClerkJwt, bearer, ensureProfile,
  generateApiKey, sha256Hex, encryptString, decryptString, GLOBAL_DEFAULT_BLOCKED, createTenantClient } from "../_shared/anveguard.ts";
import { evaluate as evaluatePolicy, DEFAULT_SETTINGS, isSafeRegex, MAX_REGEX_PATTERN_LEN,
  type PolicyRule, type PolicyIntent, type PolicySettings } from "../_shared/policy_engine.ts";
import { HARNESS_CASES, type ExpectedVerdict } from "../_shared/policy_test_corpus.ts";
import { PROVIDERS, getProvider, CUSTOM_SCHEMA, resolveCustomEndpoint,
  resolveEndpoint, sanitizeExtraHeaders, validateCustomUrl } from "../_shared/providers.ts";
import { parseModelsResponse } from "../_shared/models_parsers.ts";

// In-memory cache for /models responses (per provider+key, 5 min TTL).
const modelsCache = new Map<string, { models: string[]; exp: number }>();

// Sentinel value that the wizard sends when the user clicks
// "Use default test key" — we resolve it to a server-side env var per provider.
const SERVER_DEFAULT_SENTINEL = "__SERVER_DEFAULT__";
const SERVER_DEFAULT_KEY_ENV: Record<string, string> = {
  perplexity: "PERPLEXITY_API_KEY",
};
function resolveServerDefaultKey(provider: string | undefined, supplied: unknown): string | undefined {
  if (typeof supplied !== "string") return supplied as undefined;
  if (supplied !== SERVER_DEFAULT_SENTINEL) return supplied;
  const envName = provider ? SERVER_DEFAULT_KEY_ENV[provider] : undefined;
  if (!envName) return "";
  return Deno.env.get(envName) ?? "";
}


// Built-in intent labels the classifier knows about. The user catalog
// (`known_intents` table) is unioned with these wherever the dashboard
// returns a `known_intents` list to the UI.
const BUILTIN_INTENTS = [
  "jailbreak", "prompt_injection", "data_exfiltration",
  "off_topic", "tool_abuse", "harassment", "other",
] as const;

async function loadKnownIntentNames(
  sb: ReturnType<typeof service>, userId: string,
): Promise<string[]> {
  const { data } = await sb.from("known_intents").select("name").eq("user_id", userId);
  const custom = (data ?? []).map((r: any) => String(r.name)).filter(Boolean);
  return Array.from(new Set([...BUILTIN_INTENTS, ...custom]));
}

/**
 * Validate a webhook target URL — SSRF-safe. Rejects:
 *   - Non-HTTPS schemes (HTTP allowed only on localhost for dev convenience)
 *   - Hostnames that resolve to private IP space, link-local, loopback,
 *     or our own Supabase project (so alerts can't loop back)
 *   - Hostnames with credentials (`user:pass@host`)
 *
 * This is the lightweight version — for production-grade SSRF defense the
 * actual fetch should also pin the resolved IP and reject after DNS lookup
 * (DNS rebinding). That's a follow-up; this catches the common foot-guns.
 */
function validateWebhookUrl(raw: string): { ok: true; url: URL } | { ok: false; reason: string } {
  let url: URL;
  try { url = new URL(raw); } catch { return { ok: false, reason: "invalid URL" }; }
  if (url.username || url.password) return { ok: false, reason: "URL must not contain credentials" };
  if (!["http:", "https:"].includes(url.protocol)) return { ok: false, reason: "URL must be http(s)" };
  const host = url.hostname.toLowerCase();
  // Block obvious internal / loopback / link-local hosts.
  const PRIVATE_HOSTS = [/^localhost$/, /^127\./, /^0\./, /^169\.254\./, /^10\./, /^192\.168\./, /^172\.(1[6-9]|2[0-9]|3[0-1])\./, /^::1$/, /^fc/i, /^fd/i, /^fe80/i];
  if (url.protocol === "http:" && host !== "localhost" && !host.startsWith("127.")) {
    return { ok: false, reason: "HTTP only allowed on localhost — use HTTPS for external receivers" };
  }
  if (PRIVATE_HOSTS.some((re) => re.test(host))) {
    return { ok: false, reason: `webhook target is in a private/loopback range: ${host}` };
  }
  // Don't allow alerts to loop back to our own Supabase project — that
  // creates feedback amplification on bad days.
  if (host.endsWith(".supabase.co") || host.endsWith(".supabase.com")) {
    return { ok: false, reason: "webhook target cannot be a Supabase host" };
  }
  return { ok: true, url };
}

/**
 * Centralized audit-log helper. Every mutating dashboard action should call
 * this so the audit trail stays uniform (key/case format, actor stamping)
 * and easy to query. Best-effort — never blocks the response on logging.
 *
 * Action format: `<resource>.<verb>` e.g. "endpoint.saved", "policy_rule.deleted",
 * "endpoint_share.granted", "policy_template.rolled_back".
 */
async function auditAction(
  sb: ReturnType<typeof service>,
  userId: string,
  action: string,
  targetType: string,
  targetId: string | null,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  try {
    await sb.from("audit_logs").insert({
      user_id: userId,
      actor_user_id: userId,
      action,
      target_type: targetType,
      target_id: targetId,
      metadata,
    });
  } catch (e) {
    console.error("audit_logs insert failed (non-fatal):", e instanceof Error ? e.message : e);
  }
}

/**
 * Look up an endpoint row that the caller is allowed to *read*. The caller is
 * allowed to read a row if either:
 *   1. They own it (`endpoints.user_id = userId`), OR
 *   2. The endpoint owner has explicitly shared it with them via `endpoint_shares`
 *      (matched on the resolved `shared_with_user_id`).
 *
 * Read access does NOT grant the right to mutate the row, mint API keys against
 * it, or see the encrypted provider key — callers of this helper must ONLY use
 * it for read/test/list-models flows. The encrypted key in the returned row is
 * meant to be decrypted server-side and used to call the upstream; it must never
 * be written into a response body.
 */
async function loadReadableEndpoint(
  sb: ReturnType<typeof service>, endpointId: string, userId: string,
): Promise<{ row: any | null; isShared: boolean }> {
  const { data: owned } = await sb.from("endpoints").select("*")
    .eq("id", endpointId).eq("user_id", userId).maybeSingle();
  if (owned) return { row: owned, isShared: false };

  const { data: share } = await sb.from("endpoint_shares")
    .select("endpoint_id").eq("endpoint_id", endpointId)
    .eq("shared_with_user_id", userId).maybeSingle();
  if (!share) return { row: null, isShared: false };

  const { data: shared } = await sb.from("endpoints").select("*")
    .eq("id", endpointId).maybeSingle();
  return { row: shared ?? null, isShared: !!shared };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: dashboardCorsHeaders(req) });

  // /healthz — unauthenticated readiness probe for uptime monitors. Cheap
  // DB ping, no Clerk JWT required, wildcard-friendly. Must come before the
  // bearer check so monitors don't need credentials.
  {
    const path = new URL(req.url).pathname.replace(/\/+$/, "");
    if (req.method === "GET" && (path.endsWith("/healthz") || path.endsWith("/health"))) {
      const start = Date.now();
      let dbOk = false;
      let dbError: string | null = null;
      try {
        const sb = service();
        const { error } = await sb.from("profiles").select("clerk_user_id", { count: "exact", head: true }).limit(0);
        dbOk = !error;
        if (error) dbError = error.message.slice(0, 120);
      } catch (e) {
        dbError = e instanceof Error ? e.message.slice(0, 120) : "unknown";
      }
      return json({
        status: dbOk ? "ok" : "degraded",
        service: "anveguard-dashboard",
        version: Deno.env.get("SUPABASE_FUNCTION_VERSION") ?? "dev",
        db: dbOk ? "ok" : "down",
        db_error: dbError,
        db_latency_ms: Date.now() - start,
        time: new Date().toISOString(),
      }, dbOk ? 200 : 503);
    }
  }

  // Inner IIFE so the existing `return json(...)` sites resolve to the
  // function's return value; we then post-process CORS once on the outside.
  const inner = await (async (): Promise<Response> => {
    try {
    const token = bearer(req);
    if (!token) return json({ error: "Missing auth" }, 401);
    const { sub: userId, email } = await verifyClerkJwt(token);
    await ensureProfile(userId, email);

    const url = new URL(req.url);
    const action = url.searchParams.get("action") || (await safeJson(req))?.action;
    const body = req.method === "POST" || req.method === "PUT" ? await safeJson(req) : {};
    const sb = createTenantClient(service(), userId);

    switch (action) {
      case "list_providers": {
        return json({ providers: PROVIDERS, custom_schema: CUSTOM_SCHEMA });
      }

      case "test_custom_endpoint": {
        // Validate the form values WITHOUT persisting. Pings the resolved /models URL.
        const { base_url, models_url, kind, auth_scheme, auth_header,
                extra_headers, provider_key } = body;
        if (!base_url) return json({ ok: false, error: "Base URL required" }, 400);
        let resolved;
        try {
          resolved = resolveCustomEndpoint({
            base_url, models_url, kind, auth_scheme,
            auth_header, extra_headers,
          });
        } catch (e) {
          return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 400);
        }
        const headers: Record<string, string> = { Accept: "application/json", ...resolved.extra_headers };
        let pingUrl = resolved.models_url;
        if (provider_key && resolved.auth_scheme !== "none") {
          if (resolved.auth_scheme === "bearer") headers["Authorization"] = `Bearer ${provider_key}`;
          else if (resolved.auth_scheme === "x-api-key") headers["x-api-key"] = provider_key;
          else if (resolved.auth_scheme === "header") headers[resolved.auth_header] = provider_key;
          else if (resolved.auth_scheme === "query") {
            const u = new URL(pingUrl);
            u.searchParams.set(resolved.auth_header, provider_key);
            pingUrl = u.toString();
          }
        }
        if (resolved.kind === "anthropic" && !headers["anthropic-version"]) {
          headers["anthropic-version"] = "2023-06-01";
        }
        try {
          const r = await fetch(pingUrl, { headers });
          const text = await r.text();
          let sample: string | null = null;
          try {
            const j = JSON.parse(text);
            const hint = resolved.kind === "anthropic" ? "anthropic" : null;
            const parsed = parseModelsResponse(j, hint);
            sample = parsed.ids[0] ?? null;
          } catch { /* not JSON */ }
          return json({
            ok: r.ok,
            status: r.status,
            url: resolved.models_url,
            chat_url: resolved.url,
            sample_model: sample,
            error: r.ok ? null : text.slice(0, 300),
          });
        } catch (e) {
          return json({ ok: false, error: e instanceof Error ? e.message : String(e) });
        }
      }

      case "list_models": {
        const { api_key_id } = body;
        if (!api_key_id) return json({ error: "api_key_id required" }, 400);
        const { data: keyRow } = await sb.from("api_keys")
          .select("id,user_id,provider,provider_key_encrypted,custom_base_url,custom_models_url,custom_kind,custom_auth_scheme,custom_auth_header,custom_extra_headers,custom_model_suggestions")
          .eq("id", api_key_id).eq("user_id", userId).maybeSingle();
        if (!keyRow) return json({ error: "Key not found" }, 404);

        // Resolve target URL + headers
        const upstreamKey = keyRow.provider_key_encrypted
          ? await decryptString(keyRow.provider_key_encrypted) : "";

        let resolvedUrl: string | undefined;
        let headers: Record<string, string> = { Accept: "application/json" };
        let fallbackSuggestions: string[] = [];

        if (keyRow.provider === "custom") {
          try {
            const r = resolveEndpoint(keyRow as any, upstreamKey || null);
            resolvedUrl = r.models_url;
            headers = { ...headers, ...r.headers };
          } catch (e) {
            return json({ error: e instanceof Error ? e.message : String(e) }, 400);
          }
          fallbackSuggestions = keyRow.custom_model_suggestions ?? [];
        } else {
          const def = getProvider(keyRow.provider);
          if (!def) return json({ error: "Unknown provider" }, 400);
          if (def.managed || !def.models_url) {
            return json({ models: def.model_suggestions, source: "static" });
          }
          resolvedUrl = def.models_url;
          if (def.kind === "anthropic") {
            if (upstreamKey) headers["x-api-key"] = upstreamKey;
            headers["anthropic-version"] = "2023-06-01";
          } else if (upstreamKey) {
            headers["Authorization"] = `Bearer ${upstreamKey}`;
          }
          fallbackSuggestions = def.model_suggestions;
        }

        const cacheKey = `${keyRow.provider}:${keyRow.custom_base_url ?? ""}:${keyRow.provider_key_encrypted ?? ""}`;
        const cached = modelsCache.get(cacheKey);
        if (cached && cached.exp > Date.now()) {
          return json({ models: cached.models, source: "cache" });
        }

        try {
          const r = await fetch(resolvedUrl!, { headers });
          if (!r.ok) {
            const txt = await r.text();
            return json({ models: fallbackSuggestions, source: "fallback", warning: `Upstream ${r.status}: ${txt.slice(0, 200)}` });
          }
          const j = await r.json();
          const hint = keyRow.provider === "custom"
            ? (keyRow.custom_kind === "anthropic" ? "anthropic"
                : (keyRow.custom_kind === "ollama" ? "ollama" : null))
            : (getProvider(keyRow.provider)?.kind === "anthropic" ? "anthropic" : null);
          const parsed = parseModelsResponse(j, hint);

          // Provider-specific filtering + normalization (e.g. Perplexity
          // advertises external vendor ids in /v1/models that its chat
          // endpoint won't accept, and uses "perplexity/sonar" instead of
          // the bare "sonar").
          const def = keyRow.provider !== "custom" ? getProvider(keyRow.provider) : null;
          let filteredModels = parsed.models;
          if (def?.model_id_filter) {
            filteredModels = filteredModels.filter((m) => def.model_id_filter!({ id: m.id, owned_by: m.owned_by ?? null }));
          }
          let ids = filteredModels.map((m) => m.id);
          if (def?.model_id_normalize) {
            const seen = new Set<string>();
            const out: string[] = [];
            for (const raw of ids) {
              const norm = def.model_id_normalize(raw);
              if (!norm || seen.has(norm)) continue;
              seen.add(norm);
              out.push(norm);
            }
            ids = out;
          }
          const models = ids.length > 0 ? ids : fallbackSuggestions;
          modelsCache.set(cacheKey, { models, exp: Date.now() + 5 * 60_000 });
          return json({ models, source: "live", shape: parsed.shape });
        } catch (e) {
          return json({ models: fallbackSuggestions, source: "fallback", warning: String(e) });
        }
      }

      case "list_keys": {
        const { data } = await sb.from("api_keys")
          .select("id,name,key_prefix,provider,model_default,is_active,is_admin,compression_mode,created_at,last_used_at,custom_base_url,custom_kind,endpoint_id,spend_limit_usd,current_spend_usd,token_limit,current_token_spend,limit_window,limit_reset_at")
          .eq("user_id", userId).order("created_at", { ascending: false });
        const keys = data ?? [];
        // Enrich custom-endpoint-bound keys with the endpoint name so the UI
        // can show "my-key — Perplexity (Sonar)" instead of just "custom".
        const epIds = Array.from(new Set(keys.map((k: any) => k.endpoint_id).filter(Boolean)));
        const epMap: Record<string, string> = {};
        if (epIds.length > 0) {
          const { data: eps } = await sb.from("endpoints")
            .select("id,name").in("id", epIds);
          for (const e of eps ?? []) epMap[e.id] = e.name;
        }
        const enriched = keys.map((k: any) => ({
          ...k,
          endpoint_name: k.endpoint_id ? (epMap[k.endpoint_id] ?? null) : null,
        }));
        return json({ keys: enriched });
      }

      case "set_key_admin": {
        // Toggle the per-key admin permission. Admin keys are allowed to send
        // a custom `system_prompt` alongside the workspace guardrail.
        const { id, is_admin } = body;
        if (!id) return json({ error: "id required" }, 400);
        const { error: updErr } = await sb.from("api_keys")
          .update({ is_admin: !!is_admin }).eq("id", id).eq("user_id", userId);
        if (updErr) return json({ error: updErr.message }, 400);
        await sb.from("audit_logs").insert({
          user_id: userId,
          actor_user_id: userId,
          action: is_admin ? "api_key.admin_granted" : "api_key.admin_revoked",
          target_type: "api_key",
          target_id: id,
          metadata: {},
        });
        return json({ ok: true });
      }

      case "bulk_set_key_admin": {
        // Bulk-toggle the per-key admin permission for multiple keys at once.
        // We always scope by `user_id` so a forged id list can't touch keys
        // outside the caller's workspace. We also re-read the rows first so
        // the audit trail can capture the previous value (some keys may be
        // a no-op if they're already in the requested state).
        const { ids, is_admin } = body as { ids?: unknown; is_admin?: unknown };
        if (!Array.isArray(ids) || ids.length === 0) {
          return json({ error: "ids must be a non-empty array" }, 400);
        }
        const idList = ids.filter((v): v is string => typeof v === "string" && v.length > 0);
        if (idList.length === 0) return json({ error: "no valid ids" }, 400);
        if (idList.length > 200) return json({ error: "too many ids (max 200)" }, 400);
        const target = !!is_admin;

        const { data: rows, error: readErr } = await sb.from("api_keys")
          .select("id,name,key_prefix,is_admin")
          .eq("user_id", userId).in("id", idList);
        if (readErr) return json({ error: readErr.message }, 400);
        const safeRows = rows ?? [];
        const changing = safeRows.filter((r: any) => !!r.is_admin !== target);

        if (changing.length === 0) {
          return json({ ok: true, updated: 0, unchanged: safeRows.length });
        }

        const { error: updErr } = await sb.from("api_keys")
          .update({ is_admin: target })
          .eq("user_id", userId)
          .in("id", changing.map((r: any) => r.id));
        if (updErr) return json({ error: updErr.message }, 400);

        // One audit row per changed key — keeps the audit feed scannable and
        // matches the per-key action format the UI already renders.
        const auditRows = changing.map((r: any) => ({
          user_id: userId,
          actor_user_id: userId,
          action: target ? "api_key.admin_granted" : "api_key.admin_revoked",
          target_type: "api_key",
          target_id: r.id,
          metadata: {
            key_name: r.name,
            key_prefix: r.key_prefix,
            previous_is_admin: !!r.is_admin,
            new_is_admin: target,
            via: "bulk",
            batch_size: changing.length,
          },
        }));
        await sb.from("audit_logs").insert(auditRows);
        return json({
          ok: true,
          updated: changing.length,
          unchanged: safeRows.length - changing.length,
        });
      }

      case "set_key_compression": {
        const { id, mode } = body as { id?: string; mode?: string };
        const allowed = ["inherit", "off", "light", "balanced", "aggressive"];
        if (!id || !mode || !allowed.includes(String(mode))) {
          return json({ error: "id and valid mode required" }, 400);
        }
        const { data: prev } = await sb.from("api_keys")
          .select("compression_mode,name,key_prefix").eq("id", id).eq("user_id", userId).maybeSingle();
        const { error: updErr } = await sb.from("api_keys")
          .update({ compression_mode: mode }).eq("id", id).eq("user_id", userId);
        if (updErr) return json({ error: updErr.message }, 400);
        await sb.from("audit_logs").insert({
          user_id: userId, actor_user_id: userId,
          action: "api_key.compression_changed",
          target_type: "api_key", target_id: id,
          metadata: {
            key_name: prev?.name, key_prefix: prev?.key_prefix,
            previous_mode: prev?.compression_mode ?? null, new_mode: mode,
          },
        });
        return json({ ok: true });
      }

      case "bulk_set_key_compression": {
        const { ids, mode } = body as { ids?: unknown; mode?: unknown };
        const allowed = ["inherit", "off", "light", "balanced", "aggressive"];
        if (!Array.isArray(ids) || ids.length === 0) return json({ error: "ids must be non-empty" }, 400);
        if (typeof mode !== "string" || !allowed.includes(mode)) return json({ error: "invalid mode" }, 400);
        const idList = (ids as unknown[]).filter((v): v is string => typeof v === "string" && v.length > 0);
        if (idList.length === 0) return json({ error: "no valid ids" }, 400);
        if (idList.length > 200) return json({ error: "too many ids (max 200)" }, 400);
        const { data: rows } = await sb.from("api_keys")
          .select("id,name,key_prefix,compression_mode")
          .eq("user_id", userId).in("id", idList);
        const safeRows = rows ?? [];
        const changing = safeRows.filter((r: any) => r.compression_mode !== mode);
        if (changing.length === 0) return json({ ok: true, updated: 0, unchanged: safeRows.length });
        const { error: updErr } = await sb.from("api_keys")
          .update({ compression_mode: mode })
          .eq("user_id", userId).in("id", changing.map((r: any) => r.id));
        if (updErr) return json({ error: updErr.message }, 400);
        await sb.from("audit_logs").insert(changing.map((r: any) => ({
          user_id: userId, actor_user_id: userId,
          action: "api_key.compression_changed",
          target_type: "api_key", target_id: r.id,
          metadata: {
            key_name: r.name, key_prefix: r.key_prefix,
            previous_mode: r.compression_mode, new_mode: mode,
            via: "bulk", batch_size: changing.length,
          },
        })));
        return json({ ok: true, updated: changing.length, unchanged: safeRows.length - changing.length });
      }

      case "create_key": {
        const { name, provider, model, provider_key, custom, endpoint_id, is_admin, spend_limit_usd, token_limit, limit_window } = body;
        const def = getProvider(provider);
        if (!name || !def) return json({ error: "Invalid provider" }, 400);

        const spendLimitUsd = spend_limit_usd != null && spend_limit_usd !== "" ? Number(spend_limit_usd) : null;
        const tokenLimit = token_limit != null && token_limit !== "" ? Math.floor(Number(token_limit)) : null;
        const limitWin = ["infinite", "daily", "monthly"].includes(String(limit_window)) ? String(limit_window) : "infinite";
        
        let limitResetAt: string | null = null;
        if (limitWin !== "infinite") {
          const now = new Date();
          let nextReset: Date | null = null;
          if (limitWin === "daily") {
            nextReset = new Date(now);
            nextReset.setDate(nextReset.getDate() + 1);
            nextReset.setHours(0, 0, 0, 0);
          } else if (limitWin === "monthly") {
            nextReset = new Date(now);
            nextReset.setMonth(nextReset.getMonth() + 1);
            nextReset.setDate(1);
            nextReset.setHours(0, 0, 0, 0);
          }
          if (nextReset) limitResetAt = nextReset.toISOString();
        }

        const insert: Record<string, unknown> = {
          user_id: userId, name, provider,
          model_default: model || def.default_model || "",
          is_admin: !!is_admin,
          spend_limit_usd: spendLimitUsd,
          token_limit: tokenLimit,
          limit_window: limitWin,
          limit_reset_at: limitResetAt,
        };

        if (provider === "custom") {
          // Two paths: (a) attach a saved endpoint via endpoint_id,
          //           (b) inline custom config (legacy / quick create).
          if (endpoint_id) {
            const { data: ep } = await sb.from("endpoints").select("*")
              .eq("id", endpoint_id).eq("user_id", userId).maybeSingle();
            if (!ep) return json({ error: "Endpoint not found" }, 404);
            insert.endpoint_id = ep.id;
            // Mirror the endpoint's config into custom_* cols so the proxy keeps
            // working from a single row read (no JOIN needed at request time).
            insert.custom_base_url = ep.base_url;
            insert.custom_models_url = ep.models_url;
            insert.custom_kind = ep.kind;
            insert.custom_auth_scheme = ep.auth_scheme;
            insert.custom_auth_header = ep.auth_header;
            insert.custom_extra_headers = ep.extra_headers ?? {};
            insert.custom_model_suggestions = ep.model_suggestions ?? [];
            insert.custom_path_prefix = ep.path_prefix ?? null;
            insert.custom_chat_path = ep.chat_path ?? null;
            insert.custom_models_path = ep.models_path ?? null;
            insert.custom_response_format = ep.response_format ?? null;
            insert.provider_key_encrypted = ep.provider_key_encrypted ?? null;
            if (!model && ep.default_model) insert.model_default = ep.default_model;
          } else {
            if (!custom || typeof custom !== "object") {
              return json({ error: "Custom endpoint config required" }, 400);
            }
            let resolved;
            try {
              resolved = resolveCustomEndpoint({
                base_url: custom.base_url,
                models_url: custom.models_url || null,
                kind: custom.kind,
                auth_scheme: custom.auth_scheme,
                auth_header: custom.auth_header || null,
                extra_headers: custom.extra_headers || null,
                path_prefix: custom.path_prefix || null,
                chat_path: custom.chat_path || null,
                models_path: custom.models_path || null,
                response_format: custom.response_format || null,
              });
            } catch (e) {
              return json({ error: e instanceof Error ? e.message : String(e) }, 400);
            }
            if (resolved.auth_scheme !== "none" && !provider_key) {
              return json({ error: "Provider API key required for selected auth scheme" }, 400);
            }
            insert.custom_base_url = custom.base_url;
            insert.custom_models_url = custom.models_url || null;
            insert.custom_kind = resolved.kind;
            insert.custom_auth_scheme = resolved.auth_scheme;
            insert.custom_auth_header = resolved.auth_header;
            insert.custom_extra_headers = sanitizeExtraHeaders(custom.extra_headers || null);
            insert.custom_path_prefix = custom.path_prefix || null;
            insert.custom_chat_path = custom.chat_path || null;
            insert.custom_models_path = custom.models_path || null;
            insert.custom_response_format = resolved.response_format;
            if (Array.isArray(custom.model_suggestions)) {
              insert.custom_model_suggestions = custom.model_suggestions
                .filter((x: unknown) => typeof x === "string" && x.trim())
                .map((x: string) => x.trim());
            }
            insert.provider_key_encrypted = provider_key ? await encryptString(provider_key) : null;
          }
        } else if (!def.managed && !provider_key) {
          return json({ error: `${def.label} key required` }, 400);
        } else if (!def.managed) {
          insert.provider_key_encrypted = await encryptString(provider_key);
        }

        const plain = generateApiKey();
        insert.key_hash = await sha256Hex(plain);
        insert.key_prefix = plain.slice(0, 16);

        const { data, error } = await sb.from("api_keys").insert(insert).select("id").single();
        if (error) return json({ error: error.message }, 400);
        return json({ id: data!.id, full_key: plain, key_prefix: insert.key_prefix });
      }

      // Atomic key rotation — generate a new ag_live_* key for the same
      // api_keys row, returning the plaintext exactly once. Lower-friction
      // than create+revoke because all per-key config (endpoint, alias,
      // policies, behavior profile, audit history) stays attached to the
      // same id. The OLD plaintext is invalidated immediately — there's no
      // grace window in this MVP. If you need overlap, use create+revoke.
      case "rotate_api_key": {
        const id = String(body?.id ?? "");
        if (!id) return json({ error: "id required" }, 400);
        const { data: row } = await sb.from("api_keys")
          .select("id,name,key_prefix,provider,is_active")
          .eq("id", id).eq("user_id", userId).maybeSingle();
        if (!row) return json({ error: "Key not found" }, 404);
        if (row.is_active === false) return json({ error: "Cannot rotate a revoked key — create a new one instead." }, 400);

        const newPlain = generateApiKey();
        const newHash = await sha256Hex(newPlain);
        const newPrefix = newPlain.slice(0, 16);
        const { error: updErr } = await sb.from("api_keys")
          .update({ key_hash: newHash, key_prefix: newPrefix })
          .eq("id", id).eq("user_id", userId);
        if (updErr) return json({ error: updErr.message }, 400);

        await auditAction(sb, userId, "api_key.rotated", "api_key", id, {
          key_name: row.name,
          old_prefix: row.key_prefix,
          new_prefix: newPrefix,
          provider: row.provider,
        });

        // Plaintext returned exactly once — UI must show it with the same
        // "copy this now, you won't see it again" warning the create flow uses.
        return json({
          ok: true,
          id,
          plaintext: newPlain,
          key_prefix: newPrefix,
          old_prefix: row.key_prefix,
        });
      }

      case "revoke_key": {
        const { id } = body;
        // Read the key first so the audit entry can capture name/prefix even
        // if the row is later deleted. Scoped by user_id for ownership.
        const { data: keyRow } = await sb.from("api_keys")
          .select("id,name,key_prefix,provider,is_active,endpoint_id")
          .eq("id", id).eq("user_id", userId).maybeSingle();
        if (!keyRow) return json({ error: "Key not found" }, 404);

        const { error: updErr } = await sb.from("api_keys")
          .update({ is_active: false }).eq("id", id).eq("user_id", userId);
        if (updErr) return json({ error: updErr.message }, 400);

        // Best-effort audit entry. Don't fail the revoke if logging fails — the
        // security action (disabling the key) already succeeded.
        const wasAlreadyRevoked = keyRow.is_active === false;
        await sb.from("audit_logs").insert({
          user_id: userId,
          actor_user_id: userId,
          action: "api_key.revoked",
          target_type: "api_key",
          target_id: id,
          metadata: {
            key_name: keyRow.name,
            key_prefix: keyRow.key_prefix,
            provider: keyRow.provider,
            endpoint_id: keyRow.endpoint_id,
            already_revoked: wasAlreadyRevoked,
          },
        });
        return json({ ok: true });
      }

      // ----- Live API key health check ---------------------------------------
      // Sends one or more real chat requests through the upstream the key is
      // bound to. With `parallel > 1` it fires N concurrent requests via
      // Promise.all so users can verify their key handles parallel model calls.
      // Bypasses /proxy so policy filters don't interfere with the diagnostic.
      case "test_api_key": {
        const { api_key_id, model: modelOverride, prompt: promptOverride, parallel: parallelRaw } = body;
        if (!api_key_id) return json({ error: "api_key_id required" }, 400);

        // Clamp parallel to a sane range so a single click can't spam upstream.
        const parallel = Math.max(1, Math.min(10, Number(parallelRaw) || 1));

        const { data: keyRow } = await sb.from("api_keys")
          .select("id,user_id,provider,is_active,model_default,provider_key_encrypted,custom_base_url,custom_models_url,custom_kind,custom_auth_scheme,custom_auth_header,custom_extra_headers,custom_path_prefix,custom_chat_path,custom_models_path,custom_response_format")
          .eq("id", api_key_id).eq("user_id", userId).maybeSingle();
        if (!keyRow) return json({ error: "Key not found" }, 404);
        if (!keyRow.is_active) return json({ ok: false, error: "This key has been revoked." }, 400);

        const def = keyRow.provider === "custom" ? null : getProvider(keyRow.provider);
        const isManaged = !!def?.managed;
        let upstreamKey = "";
        if (keyRow.provider_key_encrypted) {
          try { upstreamKey = await decryptString(keyRow.provider_key_encrypted); }
          catch { return json({ ok: false, error: "Failed to decrypt stored provider key." }, 500); }
        }
        if (!isManaged && !upstreamKey) {
          return json({ ok: false, error: "No upstream provider key is stored on this AnveGuard key." }, 400);
        }
        if (isManaged) upstreamKey = Deno.env.get("LOVABLE_API_KEY") ?? "";

        let url: string;
        let format: "chat_completions" | "responses" | "anthropic_messages";
        let headers: Record<string, string> = { "Content-Type": "application/json" };
        try {
          const r = resolveEndpoint(keyRow as any, upstreamKey || null);
          url = r.url;
          format = r.response_format;
          headers = { ...headers, ...r.headers };
        } catch (e) {
          return json({ ok: false, error: `Endpoint resolution failed: ${e instanceof Error ? e.message : String(e)}` }, 400);
        }

        const model = (typeof modelOverride === "string" && modelOverride.trim())
          ? modelOverride.trim() : keyRow.model_default;
        const userPrompt = (typeof promptOverride === "string" && promptOverride.trim())
          ? promptOverride.trim() : "Reply with the single word: pong";

        // One independent attempt — used both for single-shot and parallel mode.
        // Returns a structured result; never throws (caller relies on Promise.all).
        const runOne = async (idx: number) => {
          // Vary prompt slightly per attempt so providers can't dedupe-cache responses.
          const prompt = parallel > 1 ? `${userPrompt} (#${idx + 1})` : userPrompt;
          let payload: any;
          if (format === "anthropic_messages") {
            payload = { model, max_tokens: 32, messages: [{ role: "user", content: prompt }] };
          } else if (format === "responses") {
            payload = { model, input: prompt, max_output_tokens: 32 };
          } else {
            payload = { model, max_tokens: 32, messages: [{ role: "user", content: prompt }] };
          }

          const t0 = Date.now();
          let upstream: Response;
          try {
            upstream = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload) });
          } catch (e) {
            return {
              index: idx, ok: false as const, stage: "network",
              latency_ms: Date.now() - t0,
              error: `Network error: ${e instanceof Error ? e.message : String(e)}`,
            };
          }
          const latency = Date.now() - t0;
          const text = await upstream.text();

          if (!upstream.ok) {
            let detail: any = text.slice(0, 600);
            try { detail = JSON.parse(text); } catch { /* keep as string */ }
            return {
              index: idx, ok: false as const, stage: "upstream",
              status: upstream.status, latency_ms: latency,
              error: `Upstream returned ${upstream.status}`, detail,
            };
          }

          let reply = "";
          let tokens_in: number | null = null;
          let tokens_out: number | null = null;
          try {
            const j = JSON.parse(text);
            if (format === "anthropic_messages") {
              reply = Array.isArray(j?.content)
                ? j.content.filter((b: any) => b?.type === "text").map((b: any) => b.text).join("")
                : "";
              tokens_in = j?.usage?.input_tokens ?? null;
              tokens_out = j?.usage?.output_tokens ?? null;
            } else if (format === "responses") {
              reply = j?.output_text
                ?? (Array.isArray(j?.output)
                  ? j.output.flatMap((o: any) => o?.content ?? []).filter((c: any) => c?.type === "output_text").map((c: any) => c.text).join("")
                  : "");
              tokens_in = j?.usage?.input_tokens ?? null;
              tokens_out = j?.usage?.output_tokens ?? null;
            } else {
              reply = j?.choices?.[0]?.message?.content ?? "";
              tokens_in = j?.usage?.prompt_tokens ?? null;
              tokens_out = j?.usage?.completion_tokens ?? null;
            }
          } catch {
            reply = text.slice(0, 400);
          }

          return {
            index: idx, ok: true as const, stage: "upstream",
            status: upstream.status, latency_ms: latency,
            reply: typeof reply === "string" ? reply.slice(0, 400) : "",
            tokens_in, tokens_out,
          };
        };

        // Fire all attempts concurrently. Promise.all preserves per-index order
        // in the result array even though the requests resolve out of order.
        const wallStart = Date.now();
        const results = await Promise.all(Array.from({ length: parallel }, (_, i) => runOne(i)));
        const wallMs = Date.now() - wallStart;

        await sb.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyRow.id);

        // Single-call response: keep the original flat shape for back-compat.
        if (parallel === 1) {
          const r = results[0];
          return json({
            ...r,
            model, format,
            target: { url, format, model },
          });
        }

        // Parallel response: aggregate stats + per-attempt detail.
        const okCount = results.filter((r) => r.ok).length;
        const latencies = results.map((r) => r.latency_ms).sort((a, b) => a - b);
        const avg = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
        const p95 = latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))];
        return json({
          ok: okCount === results.length,
          parallel: true,
          attempts: results.length,
          succeeded: okCount,
          failed: results.length - okCount,
          wall_ms: wallMs,                    // total elapsed time for the batch
          sum_latency_ms: latencies.reduce((a, b) => a + b, 0), // sum of individual call latencies
          min_latency_ms: latencies[0],
          max_latency_ms: latencies[latencies.length - 1],
          avg_latency_ms: avg,
          p95_latency_ms: p95,
          // Speedup > 1 means calls actually ran concurrently upstream
          // (rather than being serialized somewhere along the path).
          speedup: Math.round((latencies.reduce((a, b) => a + b, 0) / Math.max(wallMs, 1)) * 100) / 100,
          model, format,
          target: { url, format, model },
          results,
        });
      }

      // Custom endpoint management (separate from API keys)
      // =====================================================================
      case "list_endpoints": {
        // Returns two collections in one payload:
        //   - `endpoints`: rows the caller owns (full editable shape, no key material).
        //   - `shared_endpoints`: rows shared *with* the caller as read-only (also stripped
        //     of `provider_key_encrypted`, plus the owner's email for display).
        // Both shapes carry `is_shared` so the UI can render them in the same table.
        const ENDPOINT_COLS =
          "id,name,base_url,models_url,kind,auth_scheme,auth_header,extra_headers,model_suggestions,default_model,path_prefix,chat_path,models_path,response_format,created_at,updated_at,user_id,provider_key_encrypted";

        const { data: owned } = await sb.from("endpoints")
          .select(ENDPOINT_COLS)
          .eq("user_id", userId).order("created_at", { ascending: false });

        const ownedRows = (owned ?? []).map((e: any) => {
          const { provider_key_encrypted, user_id: _u, ...rest } = e;
          return { ...rest, has_key: !!provider_key_encrypted, is_shared: false, permission: "owner" as const };
        });

        // Shared-with-me: join via endpoint_shares.shared_with_user_id (back-filled on first login).
        const { data: shareRows } = await sb.from("endpoint_shares")
          .select("id,endpoint_id,owner_user_id,permission,created_at")
          .eq("shared_with_user_id", userId);

        let sharedRows: any[] = [];
        if (shareRows && shareRows.length > 0) {
          const epIds = shareRows.map((s: any) => s.endpoint_id);
          const { data: epData } = await sb.from("endpoints")
            .select(ENDPOINT_COLS).in("id", epIds);
          // Resolve owner emails in one round-trip.
          const ownerIds = Array.from(new Set((epData ?? []).map((r: any) => r.user_id)));
          const ownerEmailById: Record<string, string | null> = {};
          if (ownerIds.length) {
            const { data: profs } = await sb.from("profiles")
              .select("clerk_user_id,email").in("clerk_user_id", ownerIds);
            for (const p of profs ?? []) ownerEmailById[p.clerk_user_id] = p.email ?? null;
          }
          const shareById: Record<string, any> = {};
          for (const s of shareRows) shareById[s.endpoint_id] = s;
          sharedRows = (epData ?? []).map((e: any) => {
            const { provider_key_encrypted, user_id, ...rest } = e;
            const share = shareById[e.id];
            return {
              ...rest,
              has_key: !!provider_key_encrypted,
              is_shared: true,
              permission: (share?.permission ?? "read") as "read",
              share_id: share?.id ?? null,
              owner_email: ownerEmailById[user_id] ?? null,
              shared_at: share?.created_at ?? null,
            };
          });
        }

        // Count keys per endpoint so the UI can show usage / warn before deleting.
        // Only counts the caller's own keys against their own endpoints (recipients
        // cannot create keys against shared endpoints, so this is owner-scoped).
        const { data: keyCounts } = await sb.from("api_keys")
          .select("endpoint_id").eq("user_id", userId).not("endpoint_id", "is", null);
        const counts: Record<string, number> = {};
        for (const r of keyCounts ?? []) {
          if (r.endpoint_id) counts[r.endpoint_id] = (counts[r.endpoint_id] ?? 0) + 1;
        }

        return json({
          endpoints: ownedRows.map((e: any) => ({ ...e, key_count: counts[e.id] ?? 0 })),
          shared_endpoints: sharedRows,
        });
      }

      // ---------------------------------------------------------------
      // Endpoint sharing — owner grants read-only access to a teammate.
      // The caller must OWN the endpoint to add or remove a share.
      // Recipients consume shares implicitly via list_endpoints above.
      // ---------------------------------------------------------------
      case "list_endpoint_shares": {
        const { endpoint_id } = body;
        if (!endpoint_id || typeof endpoint_id !== "string") {
          return json({ error: "endpoint_id required" }, 400);
        }
        // Verify ownership before disclosing the share list (it contains emails).
        const { data: ep } = await sb.from("endpoints")
          .select("id").eq("id", endpoint_id).eq("user_id", userId).maybeSingle();
        if (!ep) return json({ error: "Endpoint not found" }, 404);

        const { data: shares } = await sb.from("endpoint_shares")
          .select("id,shared_with_email,shared_with_user_id,permission,created_at")
          .eq("endpoint_id", endpoint_id).order("created_at", { ascending: false });
        return json({ shares: shares ?? [] });
      }

      case "add_endpoint_share": {
        const { endpoint_id, email } = body;
        if (!endpoint_id || typeof endpoint_id !== "string") {
          return json({ error: "endpoint_id required" }, 400);
        }
        const raw = typeof email === "string" ? email.trim().toLowerCase() : "";
        // Minimal email validation — the upstream profile lookup tolerates anything,
        // but we want a clear error before we hit the unique constraint.
        if (!raw || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
          return json({ error: "A valid email is required" }, 400);
        }
        // Verify ownership.
        const { data: ep } = await sb.from("endpoints")
          .select("id").eq("id", endpoint_id).eq("user_id", userId).maybeSingle();
        if (!ep) return json({ error: "Endpoint not found" }, 404);

        // Block self-share — look up caller's profile email and compare.
        const { data: ownerProfile } = await sb.from("profiles")
          .select("email").eq("clerk_user_id", userId).maybeSingle();
        if (ownerProfile?.email && ownerProfile.email.trim().toLowerCase() === raw) {
          return json({ error: "You can't share an endpoint with yourself" }, 400);
        }

        // Pre-resolve the recipient's Clerk id if they already have a profile.
        const { data: recipient } = await sb.from("profiles")
          .select("clerk_user_id").eq("email", raw).maybeSingle();

        const { data: inserted, error } = await sb.from("endpoint_shares")
          .upsert({
            endpoint_id,
            owner_user_id: userId,
            shared_with_email: raw,
            shared_with_user_id: recipient?.clerk_user_id ?? null,
            permission: "read",
          }, { onConflict: "endpoint_id,shared_with_email" })
          .select("id,shared_with_email,shared_with_user_id,permission,created_at")
          .single();
        if (error) return json({ error: error.message }, 400);
        await auditAction(sb, userId, "endpoint_share.granted", "endpoint", String(body?.endpoint_id ?? ""), {
          recipient_email: inserted?.shared_with_email,
          recipient_known: !!recipient?.clerk_user_id,
          permission: inserted?.permission,
        });
        return json({
          share: inserted,
          // Tell the UI whether the recipient already has access today vs. will pick it
          // up the next time they sign in.
          recipient_known: !!recipient?.clerk_user_id,
        });
      }

      case "remove_endpoint_share": {
        const { share_id } = body;
        if (!share_id || typeof share_id !== "string") {
          return json({ error: "share_id required" }, 400);
        }
        // Only the endpoint owner may revoke. Filtering on owner_user_id is enough
        // because we always set it when inserting.
        const { error, count } = await sb.from("endpoint_shares")
          .delete({ count: "exact" })
          .eq("id", share_id).eq("owner_user_id", userId);
        if (error) return json({ error: error.message }, 400);
        if ((count ?? 0) === 0) return json({ error: "Share not found" }, 404);
        await auditAction(sb, userId, "endpoint_share.revoked", "endpoint_share", share_id);
        return json({ ok: true });
      }

      // Update an existing api_keys row — supports rename, default-model
      // change, and swapping the primary upstream provider (with a new
      // provider_key or an attached saved endpoint). Plaintext is never
      // re-issued here; the ag_live_* secret is unchanged. Use
      // rotate_api_key for that.
      case "update_key": {
        const { id, name: newName, model_default, provider: newProvider, provider_key, custom, endpoint_id, spend_limit_usd, token_limit, limit_window } = body ?? {};
        if (!id) return json({ error: "id required" }, 400);
        const { data: row } = await sb.from("api_keys").select("*")
          .eq("id", id).eq("user_id", userId).maybeSingle();
        if (!row) return json({ error: "Key not found" }, 404);
        if (row.is_active === false) return json({ error: "Cannot edit a revoked key." }, 400);

        const patch: Record<string, unknown> = {};
        if (typeof newName === "string" && newName.trim()) patch.name = newName.trim().slice(0, 120);
        if (typeof model_default === "string" && model_default.trim()) patch.model_default = model_default.trim();

        if ("limit_window" in (body ?? {})) {
          const limitWin = ["infinite", "daily", "monthly"].includes(String(limit_window)) ? String(limit_window) : "infinite";
          patch.limit_window = limitWin;
          
          if (limitWin === "infinite") {
            patch.limit_reset_at = null;
          } else {
            const now = new Date();
            let nextReset: Date | null = null;
            if (limitWin === "daily") {
              nextReset = new Date(now);
              nextReset.setDate(nextReset.getDate() + 1);
              nextReset.setHours(0, 0, 0, 0);
            } else if (limitWin === "monthly") {
              nextReset = new Date(now);
              nextReset.setMonth(nextReset.getMonth() + 1);
              nextReset.setDate(1);
              nextReset.setHours(0, 0, 0, 0);
            }
            patch.limit_reset_at = nextReset ? nextReset.toISOString() : null;
          }
        }
        if ("spend_limit_usd" in (body ?? {})) {
          patch.spend_limit_usd = spend_limit_usd != null && spend_limit_usd !== "" ? Number(spend_limit_usd) : null;
        }
        if ("token_limit" in (body ?? {})) {
          patch.token_limit = token_limit != null && token_limit !== "" ? Math.floor(Number(token_limit)) : null;
        }

        const changingProvider = typeof newProvider === "string" && newProvider !== row.provider;
        const changingKey = typeof provider_key === "string" && provider_key.length > 0;
        const changingEndpoint = typeof endpoint_id === "string" && endpoint_id;
        const changingCustom = custom && typeof custom === "object";

        if (changingProvider || changingKey || changingEndpoint || changingCustom) {
          const targetProvider = changingProvider ? newProvider : row.provider;
          const def = getProvider(targetProvider);
          if (!def) return json({ error: "Invalid provider" }, 400);
          patch.provider = targetProvider;

          if (targetProvider === "custom") {
            if (changingEndpoint) {
              const { data: ep } = await sb.from("endpoints").select("*")
                .eq("id", endpoint_id).eq("user_id", userId).maybeSingle();
              if (!ep) return json({ error: "Endpoint not found" }, 404);
              patch.endpoint_id = ep.id;
              patch.custom_base_url = ep.base_url;
              patch.custom_models_url = ep.models_url;
              patch.custom_kind = ep.kind;
              patch.custom_auth_scheme = ep.auth_scheme;
              patch.custom_auth_header = ep.auth_header;
              patch.custom_extra_headers = ep.extra_headers ?? {};
              patch.custom_model_suggestions = ep.model_suggestions ?? [];
              patch.custom_path_prefix = ep.path_prefix ?? null;
              patch.custom_chat_path = ep.chat_path ?? null;
              patch.custom_models_path = ep.models_path ?? null;
              patch.custom_response_format = ep.response_format ?? null;
              patch.provider_key_encrypted = ep.provider_key_encrypted ?? null;
              if (!patch.model_default && ep.default_model) patch.model_default = ep.default_model;
            } else if (changingCustom) {
              let resolved;
              try {
                resolved = resolveCustomEndpoint({
                  base_url: custom.base_url,
                  models_url: custom.models_url || null,
                  kind: custom.kind,
                  auth_scheme: custom.auth_scheme,
                  auth_header: custom.auth_header || null,
                  extra_headers: custom.extra_headers || null,
                  path_prefix: custom.path_prefix || null,
                  chat_path: custom.chat_path || null,
                  models_path: custom.models_path || null,
                  response_format: custom.response_format || null,
                });
              } catch (e) {
                return json({ error: e instanceof Error ? e.message : String(e) }, 400);
              }
              if (resolved.auth_scheme !== "none" && !provider_key && !row.provider_key_encrypted) {
                return json({ error: "Provider API key required for selected auth scheme" }, 400);
              }
              patch.endpoint_id = null;
              patch.custom_base_url = custom.base_url;
              patch.custom_models_url = custom.models_url || null;
              patch.custom_kind = resolved.kind;
              patch.custom_auth_scheme = resolved.auth_scheme;
              patch.custom_auth_header = resolved.auth_header;
              patch.custom_extra_headers = sanitizeExtraHeaders(custom.extra_headers || null);
              patch.custom_path_prefix = custom.path_prefix || null;
              patch.custom_chat_path = custom.chat_path || null;
              patch.custom_models_path = custom.models_path || null;
              patch.custom_response_format = resolved.response_format;
              if (Array.isArray(custom.model_suggestions)) {
                patch.custom_model_suggestions = custom.model_suggestions
                  .filter((x: unknown) => typeof x === "string" && x.trim())
                  .map((x: string) => x.trim());
              }
              if (provider_key) patch.provider_key_encrypted = await encryptString(provider_key);
            } else if (changingKey) {
              patch.provider_key_encrypted = await encryptString(provider_key);
            }
          } else {
            // First-class provider swap — wipe custom_* and require a key
            // unless the provider is managed.
            if (changingProvider) {
              patch.endpoint_id = null;
              patch.custom_base_url = null;
              patch.custom_models_url = null;
              patch.custom_kind = null;
              patch.custom_auth_scheme = null;
              patch.custom_auth_header = null;
              patch.custom_extra_headers = null;
              patch.custom_model_suggestions = null;
              patch.custom_path_prefix = null;
              patch.custom_chat_path = null;
              patch.custom_models_path = null;
              patch.custom_response_format = null;
            }
            if (def.managed) {
              if (changingProvider) patch.provider_key_encrypted = null;
            } else if (changingKey) {
              patch.provider_key_encrypted = await encryptString(provider_key);
            } else if (changingProvider && !row.provider_key_encrypted) {
              return json({ error: `${def.label} key required` }, 400);
            }
          }
        }

        if (Object.keys(patch).length === 0) {
          return json({ ok: true, id, unchanged: true });
        }

        const { error: updErr } = await sb.from("api_keys")
          .update(patch).eq("id", id).eq("user_id", userId);
        if (updErr) return json({ error: updErr.message }, 400);

        await auditAction(sb, userId, "api_key.updated", "api_key", id, {
          key_name: patch.name ?? row.name,
          key_prefix: row.key_prefix,
          changed: Object.keys(patch),
          previous_provider: row.provider,
          new_provider: patch.provider ?? row.provider,
        });
        return json({ ok: true, id });
      }


      case "save_endpoint": {
        // Create or update. Pass `id` to update.
        const { id, name, base_url, models_url, kind, auth_scheme, auth_header,
                extra_headers, model_suggestions, default_model, provider_key,
                clear_provider_key,
                path_prefix, chat_path, models_path, response_format } = body;
        if (!name || !base_url) return json({ error: "Name and base URL required" }, 400);

        let resolved;
        try {
          resolved = resolveCustomEndpoint({
            base_url, models_url: models_url || null, kind,
            auth_scheme, auth_header: auth_header || null,
            extra_headers: extra_headers || null,
            path_prefix: path_prefix || null,
            chat_path: chat_path || null,
            models_path: models_path || null,
            response_format: response_format || null,
          });
        } catch (e) {
          return json({ error: e instanceof Error ? e.message : String(e) }, 400);
        }

        const row: Record<string, unknown> = {
          user_id: userId,
          name: String(name).slice(0, 120),
          base_url: String(base_url),
          models_url: models_url || null,
          kind: resolved.kind,
          auth_scheme: resolved.auth_scheme,
          auth_header: resolved.auth_header,
          extra_headers: sanitizeExtraHeaders(extra_headers || null),
          model_suggestions: Array.isArray(model_suggestions)
            ? model_suggestions
                .filter((x: unknown) => typeof x === "string" && x.trim())
                .map((x: string) => x.trim())
            : [],
          default_model: default_model ? String(default_model).slice(0, 200) : null,
          path_prefix: path_prefix ? String(path_prefix).slice(0, 200) : null,
          chat_path: chat_path ? String(chat_path).slice(0, 200) : null,
          models_path: models_path ? String(models_path).slice(0, 200) : null,
          response_format: resolved.response_format,
        };

        if (provider_key) {
          row.provider_key_encrypted = await encryptString(provider_key);
        } else if (clear_provider_key) {
          row.provider_key_encrypted = null;
        }

        if (id) {
          // Update — keep existing key unless caller sent provider_key/clear flag.
          const { data, error } = await sb.from("endpoints")
            .update(row).eq("id", id).eq("user_id", userId).select("id").maybeSingle();
          if (error) return json({ error: error.message }, 400);
          if (!data) return json({ error: "Endpoint not found" }, 404);
          await auditAction(sb, userId, "endpoint.updated", "endpoint", data.id, {
            name, base_url: row.base_url, kind: row.kind,
          });
          return json({ id: data.id });
        } else {
          if (resolved.auth_scheme !== "none" && !provider_key) {
            return json({ error: "Provider API key required for selected auth scheme" }, 400);
          }
          const { data, error } = await sb.from("endpoints")
            .insert(row).select("id").single();
          if (error) return json({ error: error.message }, 400);
          await auditAction(sb, userId, "endpoint.created", "endpoint", data.id, {
            name, base_url: row.base_url, kind: row.kind,
          });
          return json({ id: data.id });
        }
      }

      case "delete_endpoint": {
        const { id } = body;
        if (!id) return json({ error: "id required" }, 400);
        // Check if any API key still references it
        const { count } = await sb.from("api_keys")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId).eq("endpoint_id", id);
        if ((count ?? 0) > 0) {
          return json({ error: `Cannot delete: ${count} API key(s) still use this endpoint. Revoke or migrate them first.` }, 400);
        }
        // Snapshot the row so the audit trail keeps the name even after delete.
        const { data: row } = await sb.from("endpoints")
          .select("name,base_url,kind").eq("id", id).eq("user_id", userId).maybeSingle();
        const { error } = await sb.from("endpoints").delete()
          .eq("id", id).eq("user_id", userId);
        if (error) return json({ error: error.message }, 400);
        await auditAction(sb, userId, "endpoint.deleted", "endpoint", id, row ?? {});
        return json({ ok: true });
      }

      case "test_endpoint": {
        // Deep test: validates URL resolution, auth scheme requirements, models listing,
        // and (optionally) a low-cost chat completion probe.
        const { id, probe_chat, probe_model } = body;
        let cfg: any = body;
        let upstreamKey: string | null = body.provider_key || null;
        let hasStoredKey = false;

        if (id) {
          // Allow shared recipients to test too — read-only, key never leaves the server.
          const { row } = await loadReadableEndpoint(sb, id, userId);
          if (!row) return json({ ok: false, error: "Endpoint not found" }, 404);
          cfg = {
            base_url: row.base_url, models_url: row.models_url,
            kind: row.kind, auth_scheme: row.auth_scheme,
            auth_header: row.auth_header, extra_headers: row.extra_headers,
            path_prefix: row.path_prefix, chat_path: row.chat_path,
            models_path: row.models_path, response_format: row.response_format,
            default_model: row.default_model,
          };
          hasStoredKey = !!row.provider_key_encrypted;
          if (row.provider_key_encrypted && !upstreamKey) {
            upstreamKey = await decryptString(row.provider_key_encrypted);
          }
        }

        const checks: { name: string; ok: boolean; detail?: string }[] = [];
        const addCheck = (name: string, ok: boolean, detail?: string) =>
          checks.push({ name, ok, detail });

        // ---------- Check 1: Base URL ----------
        if (!cfg.base_url) {
          addCheck("Base URL provided", false, "Missing base_url");
          return json({ ok: false, checks, error: "Base URL required" }, 400);
        }
        try {
          new URL(cfg.base_url);
          addCheck("Base URL valid", true, cfg.base_url);
        } catch {
          addCheck("Base URL valid", false, "Not a valid URL");
          return json({ ok: false, checks, error: "Invalid base_url" }, 400);
        }

        // ---------- Check 2: Auth scheme requirements ----------
        const scheme = cfg.auth_scheme || "bearer";
        const authHeaderName = (cfg.auth_header || "").trim();
        if (scheme === "none") {
          addCheck("Auth scheme: none", true, "No credentials required");
        } else {
          const keyAvailable = !!upstreamKey || hasStoredKey;
          if (!keyAvailable) {
            addCheck(`Auth scheme: ${scheme}`, false, "Provider key missing");
            return json({ ok: false, checks, error: `Auth scheme '${scheme}' requires a provider key` }, 400);
          }
          if ((scheme === "header" || scheme === "query") && !authHeaderName) {
            addCheck(
              `Auth scheme: ${scheme}`,
              false,
              `'${scheme}' requires a header/param name (auth_header)`,
            );
            return json({
              ok: false, checks,
              error: `Auth scheme '${scheme}' requires the header/param name to be set`,
            }, 400);
          }
          if (scheme === "bearer") addCheck("Auth: Bearer token", true, "Authorization: Bearer ***");
          else if (scheme === "x-api-key") addCheck("Auth: x-api-key", true, "x-api-key: ***");
          else if (scheme === "header") addCheck(`Auth: custom header`, true, `${authHeaderName}: ***`);
          else if (scheme === "query") addCheck(`Auth: query param`, true, `?${authHeaderName}=***`);
        }

        // ---------- Check 3: URL resolution ----------
        let resolved;
        try {
          resolved = resolveCustomEndpoint({
            base_url: cfg.base_url, models_url: cfg.models_url || null,
            kind: cfg.kind, auth_scheme: scheme,
            auth_header: cfg.auth_header || null,
            extra_headers: cfg.extra_headers || null,
            path_prefix: cfg.path_prefix || null,
            chat_path: cfg.chat_path || null,
            models_path: cfg.models_path || null,
            response_format: cfg.response_format || null,
          });
          addCheck("Resolved chat URL", true, resolved.url);
          addCheck("Resolved models URL", true, resolved.models_url);
        } catch (e) {
          addCheck("URL resolution", false, e instanceof Error ? e.message : String(e));
          return json({
            ok: false, checks,
            error: e instanceof Error ? e.message : String(e),
          }, 400);
        }

        // Build headers + URL with auth applied
        const buildAuthed = (rawUrl: string) => {
          const h: Record<string, string> = { Accept: "application/json", ...resolved.extra_headers };
          let url = rawUrl;
          if (upstreamKey && resolved.auth_scheme !== "none") {
            if (resolved.auth_scheme === "bearer") h["Authorization"] = `Bearer ${upstreamKey}`;
            else if (resolved.auth_scheme === "x-api-key") h["x-api-key"] = upstreamKey;
            else if (resolved.auth_scheme === "header") h[resolved.auth_header] = upstreamKey;
            else if (resolved.auth_scheme === "query") {
              const u = new URL(url);
              u.searchParams.set(resolved.auth_header, upstreamKey);
              url = u.toString();
            }
          }
          if (resolved.kind === "anthropic" && !h["anthropic-version"]) {
            h["anthropic-version"] = "2023-06-01";
          }
          return { headers: h, url };
        };

        // ---------- Check 4: Models listing ----------
        const { headers: listHeaders, url: pingUrl } = buildAuthed(resolved.models_url);
        const t0 = Date.now();
        let r: Response;
        try {
          r = await fetch(pingUrl, { headers: listHeaders });
        } catch (e) {
          addCheck("Models endpoint reachable", false, e instanceof Error ? e.message : String(e));
          return json({
            ok: false, checks, url: pingUrl,
            chat_url: resolved.url, response_format: resolved.response_format,
            error: `Network error: ${e instanceof Error ? e.message : String(e)}`,
          });
        }
        const latency_ms = Date.now() - t0;
        const text = await r.text();
        addCheck(`Models HTTP ${r.status}`, r.ok, r.ok ? `${latency_ms}ms` : text.slice(0, 200));

        if (r.status === 401 || r.status === 403) {
          return json({
            ok: false, checks, status: r.status, latency_ms,
            url: pingUrl, chat_url: resolved.url,
            response_format: resolved.response_format,
            error: `Auth rejected (HTTP ${r.status}). Verify '${scheme}'${authHeaderName ? ` with '${authHeaderName}'` : ""} and key value. Upstream: ${text.slice(0, 200)}`,
          });
        }

        let sample: string | null = null;
        let count = 0;
        let modelIds: string[] = [];
        let parsedOk = false;
        let parsedShape: string | null = null;
        try {
          const j = JSON.parse(text);
          const hint = resolved.kind === "anthropic" ? "anthropic"
            : (resolved.kind === "ollama" ? "ollama" : null);
          const parsed = parseModelsResponse(j, hint);
          parsedOk = true;
          parsedShape = parsed.shape;
          modelIds = parsed.ids;
          count = modelIds.length;
          sample = modelIds[0] ?? null;
          addCheck("Parsed models JSON", true, `${count} model(s) found · shape: ${parsed.shape}`);
        } catch {
          addCheck("Parsed models JSON", false, "Upstream did not return JSON");
        }

        // ---------- Check 5: default_model present in upstream list ----------
        const defaultModel: string | undefined = cfg.default_model || undefined;
        if (defaultModel && parsedOk && count > 0) {
          const found = modelIds.includes(defaultModel);
          addCheck(
            `Default model "${defaultModel}" available`,
            found,
            found ? "Found in upstream list" : "Not in upstream list (may still work)",
          );
        }

        // ---------- Check 6 (optional): chat completion probe ----------
        let chatProbe: any = null;
        if (probe_chat && r.ok) {
          const probeModel = (probe_model && String(probe_model).trim())
            || defaultModel
            || sample
            || null;
          if (!probeModel) {
            addCheck("Chat probe", false, "No model available to probe");
          } else {
            const { headers: chatHeaders, url: chatUrl } = buildAuthed(resolved.url);
            chatHeaders["Content-Type"] = "application/json";
            const fmt = resolved.response_format || "chat_completions";
            let payload: any;
            if (fmt === "anthropic_messages") {
              payload = {
                model: probeModel, max_tokens: 8,
                messages: [{ role: "user", content: "ping" }],
              };
            } else if (fmt === "responses") {
              payload = { model: probeModel, input: "ping", max_output_tokens: 8 };
            } else {
              payload = {
                model: probeModel, max_tokens: 8,
                messages: [{ role: "user", content: "ping" }],
              };
            }
            const tc = Date.now();
            try {
              const cr = await fetch(chatUrl, {
                method: "POST", headers: chatHeaders, body: JSON.stringify(payload),
              });
              const ctext = await cr.text();
              chatProbe = {
                ok: cr.ok, status: cr.status,
                latency_ms: Date.now() - tc, model: probeModel,
                error: cr.ok ? null : ctext.slice(0, 300),
              };
              addCheck(
                `Chat probe (${fmt})`,
                cr.ok,
                cr.ok ? `${probeModel} · ${chatProbe.latency_ms}ms` : `HTTP ${cr.status}: ${ctext.slice(0, 160)}`,
              );
            } catch (e) {
              chatProbe = { ok: false, error: e instanceof Error ? e.message : String(e), model: probeModel };
              addCheck(`Chat probe (${fmt})`, false, chatProbe.error);
            }
          }
        }

        const allOk = checks.every((c) => c.ok);
        return json({
          ok: allOk,
          status: r.status,
          latency_ms,
          url: pingUrl,
          chat_url: resolved.url,
          response_format: resolved.response_format,
          sample_model: sample,
          model_count: count,
          checks,
          chat_probe: chatProbe,
          error: allOk ? null : (checks.find((c) => !c.ok)?.detail || text.slice(0, 300)),
        });
      }

      case "list_endpoint_models": {
        // Live "list models" for a custom endpoint — works for a saved endpoint by id
        // OR for ad-hoc form values (so users can preview models before saving).
        // Falls back to provided model_suggestions if the upstream call fails.
        const { id } = body;
        let cfg: any = body;
        let upstreamKey: string | null = body.provider_key || null;
        let fallback: string[] = Array.isArray(body.model_suggestions)
          ? body.model_suggestions.filter((s: unknown) => typeof s === "string" && s.trim())
          : [];

        if (id) {
          const { row } = await loadReadableEndpoint(sb, id, userId);
          if (!row) return json({ ok: false, error: "Endpoint not found" }, 404);
          cfg = {
            base_url: row.base_url, models_url: row.models_url,
            kind: row.kind, auth_scheme: row.auth_scheme,
            auth_header: row.auth_header, extra_headers: row.extra_headers,
            path_prefix: row.path_prefix, chat_path: row.chat_path,
            models_path: row.models_path, response_format: row.response_format,
          };
          if (row.provider_key_encrypted && !upstreamKey) {
            upstreamKey = await decryptString(row.provider_key_encrypted);
          }
          fallback = row.model_suggestions ?? [];
        }

        if (!cfg.base_url) return json({ ok: false, error: "Base URL required" }, 400);
        let resolved;
        try {
          resolved = resolveCustomEndpoint({
            base_url: cfg.base_url, models_url: cfg.models_url || null,
            kind: cfg.kind, auth_scheme: cfg.auth_scheme,
            auth_header: cfg.auth_header || null,
            extra_headers: cfg.extra_headers || null,
            path_prefix: cfg.path_prefix || null,
            chat_path: cfg.chat_path || null,
            models_path: cfg.models_path || null,
            response_format: cfg.response_format || null,
          });
        } catch (e) {
          return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 400);
        }

        const headers: Record<string, string> = { Accept: "application/json", ...resolved.extra_headers };
        let listUrl = resolved.models_url;
        if (upstreamKey && resolved.auth_scheme !== "none") {
          if (resolved.auth_scheme === "bearer") headers["Authorization"] = `Bearer ${upstreamKey}`;
          else if (resolved.auth_scheme === "x-api-key") headers["x-api-key"] = upstreamKey;
          else if (resolved.auth_scheme === "header") headers[resolved.auth_header] = upstreamKey;
          else if (resolved.auth_scheme === "query") {
            const u = new URL(listUrl);
            u.searchParams.set(resolved.auth_header, upstreamKey);
            listUrl = u.toString();
          }
        }
        if (resolved.kind === "anthropic" && !headers["anthropic-version"]) {
          headers["anthropic-version"] = "2023-06-01";
        }

        const t0 = Date.now();
        try {
          const r = await fetch(listUrl, { headers });
          const text = await r.text();
          if (!r.ok) {
            return json({
              ok: false, source: "fallback", models: fallback, url: listUrl,
              status: r.status, latency_ms: Date.now() - t0,
              error: text.slice(0, 300) || `HTTP ${r.status}`,
            });
          }
          let parsed;
          try {
            const j = JSON.parse(text);
            const hint = resolved.kind === "anthropic" ? "anthropic"
              : (resolved.kind === "ollama" ? "ollama" : null);
            parsed = parseModelsResponse(j, hint);
          } catch {
            return json({
              ok: false, source: "fallback", models: fallback, url: listUrl,
              latency_ms: Date.now() - t0,
              error: "Upstream did not return JSON",
            });
          }
          const models = parsed.ids;
          if (models.length === 0) {
            return json({
              ok: true, source: "fallback", models: fallback, url: listUrl,
              latency_ms: Date.now() - t0, shape: parsed.shape,
              warning: "Upstream returned 0 models — using fallback suggestions.",
            });
          }
          return json({
            ok: true, source: "live", models, url: listUrl,
            latency_ms: Date.now() - t0, shape: parsed.shape,
            // Include richer per-model metadata so the UI can show display names / context windows.
            model_details: parsed.models,
          });
        } catch (e) {
          return json({
            ok: false, source: "fallback", models: fallback, url: listUrl,
            latency_ms: Date.now() - t0,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }

      case "get_policies": {
        const { data } = await sb.from("policies").select("*").eq("user_id", userId).maybeSingle();
        return json({ policies: data, global_defaults: GLOBAL_DEFAULT_BLOCKED });
      }

      case "save_policies": {
        const { blocked_keywords, allowed_keywords, use_global_defaults, block_message } = body;
        await sb.from("policies").upsert({
          user_id: userId,
          blocked_keywords: Array.isArray(blocked_keywords) ? blocked_keywords : [],
          allowed_keywords: Array.isArray(allowed_keywords) ? allowed_keywords : [],
          use_global_defaults: !!use_global_defaults,
          block_message: block_message || "This request was blocked by your organization's AI policy.",
        }, { onConflict: "user_id" });
        await auditAction(sb, userId, "policies.updated", "policies", userId, {
          blocked_keywords_count: Array.isArray(blocked_keywords) ? blocked_keywords.length : 0,
          allowed_keywords_count: Array.isArray(allowed_keywords) ? allowed_keywords.length : 0,
          use_global_defaults: !!use_global_defaults,
        });
        return json({ ok: true });
      }

      // ---- Layered policy admin ------------------------------------------
      // Combined fetch for the Policies v2 UI: returns settings, rules,
      // intents, legacy keyword lists, and the catalog of known intents in a
      // single round-trip so the page can hydrate without N requests.
      case "get_policy_v2": {
        const [settingsRes, rulesRes, intentsRes, legacyRes] = await Promise.all([
          sb.from("policy_settings").select("*").eq("user_id", userId).maybeSingle(),
          sb.from("policy_rules").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
          sb.from("policy_intents").select("*").eq("user_id", userId).order("intent"),
          sb.from("policies").select("*").eq("user_id", userId).maybeSingle(),
        ]);
        const settings = settingsRes.data ?? {
          user_id: userId,
          enable_normalizer: true, enable_patterns: true, enable_heuristics: true,
          enable_intent: false, intent_shadow_mode: true, strict_mode: false,
          workspace_purpose: null,
          enable_injection_guard: true, injection_action: "block",
          enable_behavioral: true, behavioral_action: "flag",
          throttle_window_minutes: 5, throttle_flag_threshold: 10,
          behavioral_churn_threshold: 3, behavioral_persona_threshold: 3,
          behavioral_encoding_ratio_step: 0.25, behavioral_length_multiplier: 8,
          enable_fuzzy_keywords: true, enable_semantic_keywords: false,
          semantic_threshold: 0.78,
        };
        return json({
          settings,
          rules: rulesRes.data ?? [],
          intents: intentsRes.data ?? [],
          legacy: legacyRes.data ?? null,
          global_defaults: GLOBAL_DEFAULT_BLOCKED,
          known_intents: await loadKnownIntentNames(sb, userId),
        });
      }

      // Alias of save_policy_rule for the v2 UI naming convention.
      case "upsert_policy_rule":
      case "save_policy_rule": {
        const id = body?.id ? String(body.id) : null;
        const kind = String(body?.kind ?? "");
        const name = String(body?.name ?? "").trim();
        const severity = String(body?.severity ?? "high");
        const direction = String(body?.direction ?? "both");
        const enabled = body?.enabled !== false;
        const config = body?.config && typeof body.config === "object" ? body.config : {};
        const appliesToIntents = Array.isArray(body?.applies_to_intents)
          ? body.applies_to_intents.map((s: unknown) => String(s)).filter(Boolean)
          : [];
        if (!name) return json({ error: "name is required" }, 400);
        if (!["regex", "detector"].includes(kind)) return json({ error: "kind must be regex or detector" }, 400);
        if (!["low", "med", "high"].includes(severity)) return json({ error: "invalid severity" }, 400);
        if (!["input", "output", "both"].includes(direction)) return json({ error: "invalid direction" }, 400);
        if (kind === "regex") {
          const pattern = String(config.pattern ?? "");
          if (!pattern) return json({ error: "regex rule requires config.pattern" }, 400);
          if (pattern.length > MAX_REGEX_PATTERN_LEN) {
            return json({ error: `regex pattern too long (max ${MAX_REGEX_PATTERN_LEN} chars)` }, 400);
          }
          try { new RegExp(pattern, String(config.flags ?? "i")); }
          catch (e) { return json({ error: `invalid regex: ${(e as Error).message}` }, 400); }
          const safety = isSafeRegex(pattern);
          if (!safety.safe) {
            return json({ error: `unsafe regex pattern: ${safety.reason}` }, 400);
          }
        }
        const row = {
          user_id: userId, name, kind, severity, direction, enabled, config,
          applies_to_intents: appliesToIntents,
        };
        if (id) {
          const { error } = await sb.from("policy_rules").update(row).eq("id", id).eq("user_id", userId);
          if (error) return json({ error: error.message }, 400);
          await auditAction(sb, userId, "policy_rule.updated", "policy_rule", id, { name, kind, severity, direction, enabled });
          return json({ ok: true, id });
        }
        const { data, error } = await sb.from("policy_rules").insert(row).select("id").single();
        if (error) return json({ error: error.message }, 400);
        await auditAction(sb, userId, "policy_rule.created", "policy_rule", data?.id ?? null, { name, kind, severity, direction, enabled });
        return json({ ok: true, id: data?.id });
      }

      // Bulk replace intent action mappings for this user. Accepts
      // `{ intents: [{ intent, action, min_confidence }, ...] }` and writes
      // them transactionally — any intent missing from the payload is removed.
      case "save_policy_intents": {
        const items = Array.isArray(body?.intents) ? body.intents : null;
        if (!items) return json({ error: "intents array is required" }, 400);
        const normalized: { user_id: string; intent: string; action: string; min_confidence: number }[] = [];
        const seen = new Set<string>();
        for (const raw of items) {
          const intent = String(raw?.intent ?? "").trim();
          const action = String(raw?.action ?? "flag");
          const minConf = Number(raw?.min_confidence ?? 0.7);
          if (!intent) return json({ error: "intent is required" }, 400);
          if (seen.has(intent)) return json({ error: `duplicate intent: ${intent}` }, 400);
          if (!["block", "flag", "allow"].includes(action)) {
            return json({ error: `invalid action for ${intent}` }, 400);
          }
          if (!Number.isFinite(minConf) || minConf < 0 || minConf > 1) {
            return json({ error: `min_confidence out of range for ${intent}` }, 400);
          }
          seen.add(intent);
          normalized.push({ user_id: userId, intent, action, min_confidence: minConf });
        }
        // Replace: delete the ones not in the payload, upsert the rest.
        const keep = Array.from(seen);
        if (keep.length === 0) {
          await sb.from("policy_intents").delete().eq("user_id", userId);
        } else {
          await sb.from("policy_intents").delete().eq("user_id", userId).not("intent", "in", `(${keep.map((s) => `"${s.replace(/"/g, '""')}"`).join(",")})`);
          const { error } = await sb.from("policy_intents").upsert(normalized, { onConflict: "user_id,intent" });
          if (error) return json({ error: error.message }, 400);
        }
        await auditAction(sb, userId, "policy_intents.bulk_replaced", "policy_intents", userId, {
          count: normalized.length,
          intents: keep,
        });
        return json({ ok: true, count: normalized.length });
      }

      // Workspace-wide settings for the layered evaluator.
      case "get_policy_settings": {
        const { data } = await sb.from("policy_settings").select("*").eq("user_id", userId).maybeSingle();
        return json({
          settings: data ?? {
            user_id: userId,
            enable_normalizer: true,
            enable_patterns: true,
            enable_heuristics: true,
            enable_intent: false,
            intent_shadow_mode: true,
            strict_mode: false,
            workspace_purpose: null,
            // Optional, workspace-wide system prompt that the proxy prepends
            // to every forwarded request so guardrails are enforced via the
            // API regardless of what the calling client sends.
            guardrail_system_prompt: null,
            allow_client_system_prompt: false,
            system_prompt_max_length: 16000,
            enable_injection_guard: true,
            injection_action: "block",
            enable_behavioral: true,
            behavioral_action: "flag",
            throttle_window_minutes: 5,
            throttle_flag_threshold: 10,
            behavioral_churn_threshold: 3,
            behavioral_persona_threshold: 3,
            behavioral_encoding_ratio_step: 0.25,
            behavioral_length_multiplier: 8,
            enable_fuzzy_keywords: true,
            enable_semantic_keywords: false,
            semantic_threshold: 0.78,
            token_spike_alert_enabled: true,
            token_spike_window_hours: 1,
            token_spike_min_tokens: 10000,
            token_spike_ratio: 3.0,
            token_spike_webhook_url: null,
            severity_baseline_days: 7,
            severity_volume_dampening: 0.6,
            severity_score_cap: 100,
            // Triage-parity feature config (Wave 4).
            enable_tool_governance: false,
            tool_allowlist: [],
            tool_denylist: [],
            tool_governance_action: "block",
            tool_governance_scan_response: true,
            enable_egress_filter: false,
            egress_domain_allowlist: [],
            egress_domain_denylist: [],
            egress_block_private_ips: true,
            egress_action: "flag",
            egress_scan_output_urls: true,
            enable_deep_trace: true,
            enable_model_jailbreak_classifier: false,
            model_jailbreak_shadow_mode: true,
            model_jailbreak_threshold: 0.8,
            model_jailbreak_action: "block",
            enable_trained_classifier: false,
            classifier_endpoint_url: null,
            classifier_api_key: null,
            classifier_threshold: 0.8,
            classifier_action: "block",
            classifier_shadow_mode: true,
            enable_cross_tenant_guard: false,
            cross_tenant_action: "flag",
          },
          known_intents: await loadKnownIntentNames(sb, userId),
        });
      }

      case "save_policy_settings": {
        const allowedKeys = [
          "enable_normalizer", "enable_patterns", "enable_heuristics",
          "enable_intent", "intent_shadow_mode", "strict_mode",
          "enable_injection_guard", "enable_behavioral",
          "enable_fuzzy_keywords", "enable_semantic_keywords",
          "allow_client_system_prompt",
          "enable_compression",
          "enable_metadata_only_logs",
          // Triage-parity (Wave 4)
          "enable_tool_governance", "tool_governance_scan_response",
          "enable_egress_filter", "egress_scan_output_urls", "egress_block_private_ips",
          "enable_deep_trace",
          "enable_model_jailbreak_classifier", "model_jailbreak_shadow_mode",
          // Wave 2
          "enable_trained_classifier", "classifier_shadow_mode", "enable_cross_tenant_guard",
          // Wave 4
          "enable_threat_intel", "enable_mcp_governance", "enable_cost_guard",
        ] as const;
        const patch: Record<string, unknown> = { user_id: userId };
        for (const k of allowedKeys) {
          if (typeof body?.[k] === "boolean") patch[k] = body[k];
        }
        // Triage-parity (Wave 4): action enums, domain/tool lists, ml threshold.
        for (const [k, allowed] of [
          ["tool_governance_action", ["block", "flag", "sanitize"]],
          ["egress_action", ["block", "flag", "sanitize"]],
          ["model_jailbreak_action", ["block", "flag"]],
          ["classifier_action", ["block", "flag"]],
          ["cross_tenant_action", ["block", "flag"]],
          // Wave 4 actions
          ["threat_intel_action", ["block", "flag"]],
          ["threat_intel_min_severity", ["low", "med", "high", "critical"]],
          ["mcp_governance_action", ["block", "flag"]],
          ["cost_guard_action", ["block", "flag"]],
        ] as const) {
          if (k in (body ?? {})) {
            const a = String(body[k]);
            if (!(allowed as readonly string[]).includes(a)) return json({ error: `Invalid ${k}` }, 400);
            patch[k] = a;
          }
        }
        for (const k of ["tool_allowlist", "tool_denylist", "egress_domain_allowlist", "egress_domain_denylist"] as const) {
          if (k in (body ?? {})) {
            const arr = Array.isArray(body[k]) ? body[k] : [];
            patch[k] = arr.map((s: unknown) => String(s).trim().toLowerCase()).filter(Boolean).slice(0, 200);
          }
        }
        if ("model_jailbreak_threshold" in (body ?? {})) {
          const n = Number(body.model_jailbreak_threshold);
          if (!(n >= 0.5 && n <= 0.99)) return json({ error: "model_jailbreak_threshold must be 0.5..0.99" }, 400);
          patch.model_jailbreak_threshold = n;
        }
        if ("classifier_threshold" in (body ?? {})) {
          const n = Number(body.classifier_threshold);
          if (!(n >= 0.5 && n <= 0.99)) return json({ error: "classifier_threshold must be 0.5..0.99" }, 400);
          patch.classifier_threshold = n;
        }
        // Wave 4 numeric / list / map validators.
        if ("cost_budget_usd_per_request" in (body ?? {})) {
          const n = Number(body.cost_budget_usd_per_request);
          if (!(Number.isFinite(n) && n >= 0 && n <= 100)) {
            return json({ error: "cost_budget_usd_per_request must be 0..100 USD" }, 400);
          }
          patch.cost_budget_usd_per_request = n;
        }
        if ("threat_intel_feed_url" in (body ?? {})) {
          const v = body.threat_intel_feed_url;
          patch.threat_intel_feed_url = typeof v === "string" && v.trim() ? v.trim().slice(0, 2000) : null;
        }
        if ("mcp_server_allowlist" in (body ?? {})) {
          const arr = Array.isArray(body.mcp_server_allowlist) ? body.mcp_server_allowlist : [];
          patch.mcp_server_allowlist = arr
            .map((s: unknown) => String(s).trim()).filter(Boolean).slice(0, 200);
        }
        if ("mcp_pinned_tool_hashes" in (body ?? {})) {
          const v = body.mcp_pinned_tool_hashes;
          if (v && typeof v === "object" && !Array.isArray(v)) {
            const cleaned: Record<string, string> = {};
            let n = 0;
            for (const [k, h] of Object.entries(v as Record<string, unknown>)) {
              if (n >= 500) break;
              if (typeof k === "string" && typeof h === "string" && /^[a-f0-9]{64}$/i.test(h)) {
                cleaned[k.slice(0, 200)] = h.toLowerCase();
                n++;
              }
            }
            patch.mcp_pinned_tool_hashes = cleaned;
          }
        }
        for (const k of ["classifier_endpoint_url", "classifier_api_key"] as const) {
          if (k in (body ?? {})) {
            const v = body[k];
            patch[k] = typeof v === "string" && v.trim() ? v.trim().slice(0, 2000) : null;
          }
        }
        if ("workspace_purpose" in (body ?? {})) {
          const wp = body.workspace_purpose;
          patch.workspace_purpose = typeof wp === "string" && wp.trim() ? wp.trim().slice(0, 2000) : null;
        }
        if ("guardrail_system_prompt" in (body ?? {})) {
          // Capped at 8000 chars — long enough for substantial guardrails
          // without bloating every upstream request payload.
          const gp = body.guardrail_system_prompt;
          patch.guardrail_system_prompt = typeof gp === "string" && gp.trim() ? gp.trim().slice(0, 8000) : null;
        }
        if ("injection_action" in (body ?? {})) {
          const a = String(body.injection_action);
          if (!["block", "sanitize", "flag"].includes(a)) {
            return json({ error: "Invalid injection_action" }, 400);
          }
          patch.injection_action = a;
        }
        if ("behavioral_action" in (body ?? {})) {
          const a = String(body.behavioral_action);
          if (!["block", "sanitize", "flag"].includes(a)) {
            return json({ error: "Invalid behavioral_action" }, 400);
          }
          patch.behavioral_action = a;
        }
        if ("throttle_window_minutes" in (body ?? {})) {
          const n = Number(body.throttle_window_minutes);
          if (!Number.isInteger(n) || n < 1 || n > 1440) {
            return json({ error: "throttle_window_minutes must be an integer 1-1440" }, 400);
          }
          patch.throttle_window_minutes = n;
        }
        if ("throttle_flag_threshold" in (body ?? {})) {
          const n = Number(body.throttle_flag_threshold);
          if (!Number.isInteger(n) || n < 0 || n > 100000) {
            return json({ error: "throttle_flag_threshold must be a non-negative integer" }, 400);
          }
          patch.throttle_flag_threshold = n;
        }
        if ("behavioral_churn_threshold" in (body ?? {})) {
          const n = Number(body.behavioral_churn_threshold);
          if (!Number.isInteger(n) || n < 1 || n > 20) {
            return json({ error: "behavioral_churn_threshold must be an integer 1-20" }, 400);
          }
          patch.behavioral_churn_threshold = n;
        }
        if ("behavioral_persona_threshold" in (body ?? {})) {
          const n = Number(body.behavioral_persona_threshold);
          if (!Number.isInteger(n) || n < 1 || n > 20) {
            return json({ error: "behavioral_persona_threshold must be an integer 1-20" }, 400);
          }
          patch.behavioral_persona_threshold = n;
        }
        if ("behavioral_encoding_ratio_step" in (body ?? {})) {
          const n = Number(body.behavioral_encoding_ratio_step);
          if (!Number.isFinite(n) || n < 0 || n > 1) {
            return json({ error: "behavioral_encoding_ratio_step must be 0..1" }, 400);
          }
          patch.behavioral_encoding_ratio_step = n;
        }
        if ("behavioral_length_multiplier" in (body ?? {})) {
          const n = Number(body.behavioral_length_multiplier);
          if (!Number.isFinite(n) || n < 1 || n > 100) {
            return json({ error: "behavioral_length_multiplier must be 1..100" }, 400);
          }
          patch.behavioral_length_multiplier = n;
        }
        if ("semantic_threshold" in (body ?? {})) {
          const n = Number(body.semantic_threshold);
          if (!(n >= 0.5 && n <= 0.95)) {
            return json({ error: "semantic_threshold must be 0.5..0.95" }, 400);
          }
          patch.semantic_threshold = n;
        }
        if ("system_prompt_max_length" in (body ?? {})) {
          const n = Number(body.system_prompt_max_length);
          if (!Number.isInteger(n) || n < 100 || n > 64000) {
            return json({ error: "system_prompt_max_length must be an integer 100-64000" }, 400);
          }
          patch.system_prompt_max_length = n;
        }
        if ("compression_level" in (body ?? {})) {
          const v = String(body.compression_level);
          if (!["light", "balanced", "aggressive"].includes(v)) {
            return json({ error: "compression_level must be light, balanced, or aggressive" }, 400);
          }
          patch.compression_level = v;
        }
        if ("compression_min_chars" in (body ?? {})) {
          const n = Number(body.compression_min_chars);
          if (!Number.isInteger(n) || n < 0 || n > 100000) {
            return json({ error: "compression_min_chars must be an integer 0-100000" }, 400);
          }
          patch.compression_min_chars = n;
        }
        if (typeof body?.token_spike_alert_enabled === "boolean") {
          patch.token_spike_alert_enabled = body.token_spike_alert_enabled;
        }
        if ("token_spike_window_hours" in (body ?? {})) {
          const n = Number(body.token_spike_window_hours);
          if (!Number.isInteger(n) || n < 1 || n > 24) {
            return json({ error: "token_spike_window_hours must be an integer 1-24" }, 400);
          }
          patch.token_spike_window_hours = n;
        }
        if ("token_spike_min_tokens" in (body ?? {})) {
          const n = Number(body.token_spike_min_tokens);
          if (!Number.isInteger(n) || n < 0 || n > 100_000_000) {
            return json({ error: "token_spike_min_tokens must be a non-negative integer" }, 400);
          }
          patch.token_spike_min_tokens = n;
        }
        if ("token_spike_ratio" in (body ?? {})) {
          const n = Number(body.token_spike_ratio);
          if (!Number.isFinite(n) || n < 1.1 || n > 50) {
            return json({ error: "token_spike_ratio must be 1.1..50" }, 400);
          }
          patch.token_spike_ratio = n;
        }
        if ("token_spike_webhook_url" in (body ?? {})) {
          const v = body.token_spike_webhook_url;
          if (v == null || v === "") {
            patch.token_spike_webhook_url = null;
          } else {
            const s = String(v).trim();
            if (!/^https:\/\/.+/i.test(s) || s.length > 2000) {
              return json({ error: "token_spike_webhook_url must be an https URL" }, 400);
            }
            patch.token_spike_webhook_url = s;
          }
        }
        if ("severity_baseline_days" in (body ?? {})) {
          const n = Number(body.severity_baseline_days);
          if (!Number.isInteger(n) || n < 1 || n > 30) {
            return json({ error: "severity_baseline_days must be an integer 1-30" }, 400);
          }
          patch.severity_baseline_days = n;
        }
        if ("severity_volume_dampening" in (body ?? {})) {
          const n = Number(body.severity_volume_dampening);
          if (!Number.isFinite(n) || n < 0 || n > 1) {
            return json({ error: "severity_volume_dampening must be 0..1" }, 400);
          }
          patch.severity_volume_dampening = n;
        }
        if ("severity_score_cap" in (body ?? {})) {
          const n = Number(body.severity_score_cap);
          if (!Number.isInteger(n) || n < 1 || n > 100) {
            return json({ error: "severity_score_cap must be an integer 1-100" }, 400);
          }
          patch.severity_score_cap = n;
        }
        await sb.from("policy_settings").upsert(patch, { onConflict: "user_id" });
        // Audit: don't log the full patch to avoid noise — just the keys
        // changed, so we can see WHAT got tweaked without value spam.
        await auditAction(sb, userId, "policy_settings.updated", "policy_settings", userId, {
          changed_fields: Object.keys(patch).filter((k) => k !== "user_id"),
        });
        return json({ ok: true });
      }

      // Per-intent action mapping (block / flag / allow + min_confidence).
      case "list_policy_intents": {
        const { data } = await sb.from("policy_intents").select("*").eq("user_id", userId).order("intent");
        return json({ intents: data ?? [] });
      }

      case "save_policy_intent": {
        const intent = String(body?.intent ?? "").trim();
        const action = String(body?.action ?? "flag");
        const minConf = Number(body?.min_confidence ?? 0.7);
        if (!intent) return json({ error: "intent is required" }, 400);
        if (!["block", "flag", "allow"].includes(action)) {
          return json({ error: "action must be block, flag, or allow" }, 400);
        }
        if (!Number.isFinite(minConf) || minConf < 0 || minConf > 1) {
          return json({ error: "min_confidence must be between 0 and 1" }, 400);
        }
        await sb.from("policy_intents").upsert({
          user_id: userId, intent, action, min_confidence: minConf,
        }, { onConflict: "user_id,intent" });
        await auditAction(sb, userId, "policy_intent.upserted", "policy_intent", intent, { action, min_confidence: minConf });
        return json({ ok: true });
      }

      case "delete_policy_intent": {
        const intent = String(body?.intent ?? "").trim();
        if (!intent) return json({ error: "intent is required" }, 400);
        const { error } = await sb.from("policy_intents").delete().eq("user_id", userId).eq("intent", intent);
        if (error) return json({ error: error.message }, 400);
        await auditAction(sb, userId, "policy_intent.deleted", "policy_intent", intent);
        return json({ ok: true });
      }

      // ---- User-managed catalog of known intents -----------------------
      // These names show up in the template intent-routing selector. Each
      // intent can carry examples + keywords for documentation and so the
      // wizard / classifier prompts can surface them in context.
      case "list_known_intents": {
        const { data } = await sb.from("known_intents")
          .select("id,name,label,description,examples,keywords,created_at,updated_at")
          .eq("user_id", userId).order("name");
        return json({ intents: data ?? [], builtin: BUILTIN_INTENTS });
      }

      case "save_known_intent": {
        const id = body?.id ? String(body.id) : null;
        const rawName = String(body?.name ?? "").trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
        if (!rawName) return json({ error: "name is required" }, 400);
        if (rawName.length > 64) return json({ error: "name must be 64 chars or fewer" }, 400);
        if ((BUILTIN_INTENTS as readonly string[]).includes(rawName)) {
          return json({ error: `"${rawName}" is a built-in intent` }, 400);
        }
        const label = body?.label ? String(body.label).slice(0, 100) : null;
        const description = body?.description ? String(body.description).slice(0, 500) : null;
        const toArr = (v: unknown) =>
          Array.isArray(v)
            ? v.map((s) => String(s).trim()).filter(Boolean).slice(0, 50)
            : [];
        const examples = toArr(body?.examples).map((s) => s.slice(0, 500));
        const keywords = toArr(body?.keywords).map((s) => s.slice(0, 100));

        const row = { user_id: userId, name: rawName, label, description, examples, keywords };
        if (id) {
          const { data, error } = await sb.from("known_intents")
            .update(row).eq("id", id).eq("user_id", userId).select().maybeSingle();
          if (error) return json({ error: error.message }, 400);
          if (!data) return json({ error: "Intent not found" }, 404);
          await auditAction(sb, userId, "known_intent.updated", "known_intent", id, { name: rawName });
          return json({ intent: data });
        }
        const { data, error } = await sb.from("known_intents")
          .insert(row).select().maybeSingle();
        if (error) {
          if (String(error.message).includes("duplicate")) return json({ error: `Intent "${rawName}" already exists` }, 409);
          return json({ error: error.message }, 400);
        }
        await auditAction(sb, userId, "known_intent.created", "known_intent", data?.id ?? null, { name: rawName });
        return json({ intent: data });
      }

      case "delete_known_intent": {
        const id = String(body?.id ?? "");
        if (!id) return json({ error: "id required" }, 400);
        const { data: row } = await sb.from("known_intents").select("name")
          .eq("id", id).eq("user_id", userId).maybeSingle();
        const { error } = await sb.from("known_intents").delete().eq("id", id).eq("user_id", userId);
        if (error) return json({ error: error.message }, 400);
        await auditAction(sb, userId, "known_intent.deleted", "known_intent", id, row ?? {});
        return json({ ok: true });
      }
      // one or more detected intents.
      case "list_policy_rules": {
        const { data } = await sb.from("policy_rules").select("*").eq("user_id", userId).order("created_at", { ascending: false });
        return json({ rules: data ?? [] });
      }

      // (save_policy_rule handled above with upsert_policy_rule alias.)

      case "delete_policy_rule": {
        const id = String(body?.id ?? "");
        if (!id) return json({ error: "id required" }, 400);
        const { data: row } = await sb.from("policy_rules")
          .select("name,kind,severity").eq("id", id).eq("user_id", userId).maybeSingle();
        const { error } = await sb.from("policy_rules").delete().eq("id", id).eq("user_id", userId);
        if (error) return json({ error: error.message }, 400);
        await auditAction(sb, userId, "policy_rule.deleted", "policy_rule", id, row ?? {});
        return json({ ok: true });
      }

      // ---- Custom policy templates -------------------------------------
      // A template is a snapshot of the user's keyword guardrails, behavior
      // settings, and a chosen subset of policy_rules. Stored as JSON so
      // applying it later is a pure write — no ID linkage to the live rows.
      case "list_policy_templates": {
        const { data } = await sb.from("policy_templates")
          .select("id,builtin_id,name,description,policy,settings,rules,applies_to_intents,unknown_intent_fallback,created_at,updated_at")
          .eq("user_id", userId).order("created_at", { ascending: false });
        return json({ templates: data ?? [] });
      }

      case "save_policy_template": {
        const name = String(body?.name ?? "").trim();
        if (!name) return json({ error: "name required" }, 400);
        const description = body?.description ? String(body.description).slice(0, 500) : null;

        // Template-level intent scope. Empty list = applies to every intent.
        // When non-empty we also propagate the scope onto each rule's own
        // `applies_to_intents` (intersected if the rule already specified one)
        // so the live policy engine — which routes per-rule by intent — honors
        // the scope without needing a separate template-aware code path.
        const tplIntents = Array.isArray(body?.applies_to_intents)
          ? body.applies_to_intents.map((s: unknown) => String(s)).filter(Boolean)
          : [];

        const intersectIntents = (ruleIntents: string[]): string[] => {
          if (!tplIntents.length) return ruleIntents;
          if (!ruleIntents.length) return tplIntents.slice();
          const set = new Set(tplIntents);
          const overlap = ruleIntents.filter((i) => set.has(i));
          return overlap.length ? overlap : tplIntents.slice();
        };

        // Sanitize the rule snapshot — strip ids/timestamps so applying the
        // template later inserts fresh rows owned by whoever applies it.
        const rawRules = Array.isArray(body?.rules) ? body.rules : [];
        const rules = rawRules
          .filter((r: any) => r && (r.kind === "regex" || r.kind === "detector"))
          .map((r: any) => ({
            name: String(r.name ?? "").slice(0, 200),
            kind: r.kind,
            severity: ["low", "med", "high"].includes(r.severity) ? r.severity : "high",
            direction: ["input", "output", "both"].includes(r.direction) ? r.direction : "both",
            enabled: r.enabled !== false,
            config: r.config && typeof r.config === "object" ? r.config : {},
            applies_to_intents: intersectIntents(
              Array.isArray(r.applies_to_intents) ? r.applies_to_intents : [],
            ),
          }));

        const policy = body?.policy && typeof body.policy === "object" ? body.policy : {};
        const settings = body?.settings && typeof body.settings === "object" ? body.settings : {};

        const ALLOWED_FALLBACKS = ["apply_no_rules", "apply_default_rules", "reject"] as const;
        const rawFallback = String(body?.unknown_intent_fallback ?? "apply_no_rules");
        const unknownIntentFallback = (ALLOWED_FALLBACKS as readonly string[]).includes(rawFallback)
          ? rawFallback
          : "apply_no_rules";

        const changeNote = body?.change_note ? String(body.change_note).slice(0, 500) : null;
        const id = body?.id ? String(body.id) : null;
        const rawBuiltinId = body?.builtin_id ? String(body.builtin_id) : null;
        const builtinId = rawBuiltinId && /^[a-z0-9_]{1,64}$/.test(rawBuiltinId) ? rawBuiltinId : null;

        const snapshot = (tpl: any, version: number) => ({
          template_id: tpl.id,
          user_id: userId,
          version,
          name: tpl.name,
          description: tpl.description,
          policy: tpl.policy,
          settings: tpl.settings,
          rules: tpl.rules,
          applies_to_intents: tpl.applies_to_intents ?? [],
          unknown_intent_fallback: tpl.unknown_intent_fallback ?? "apply_no_rules",
          change_note: changeNote,
          created_by: userId,
        });

        // Resolve existing row: by id, or by (user, builtin_id) for built-in overrides.
        let existingId: string | null = id;
        let existingVersion = 0;
        if (id) {
          const { data: existing } = await sb.from("policy_templates")
            .select("current_version").eq("id", id).eq("user_id", userId).maybeSingle();
          if (!existing) return json({ error: "Template not found" }, 404);
          existingVersion = existing.current_version ?? 1;
        } else if (builtinId) {
          const { data: existing } = await sb.from("policy_templates")
            .select("id,current_version").eq("user_id", userId).eq("builtin_id", builtinId).maybeSingle();
          if (existing) {
            existingId = existing.id;
            existingVersion = existing.current_version ?? 1;
          }
        }

        if (existingId) {
          const nextVersion = existingVersion + 1;
          const { data, error } = await sb.from("policy_templates")
            .update({ name, description, policy, settings, rules, applies_to_intents: tplIntents, unknown_intent_fallback: unknownIntentFallback, current_version: nextVersion })
            .eq("id", existingId).eq("user_id", userId).select().maybeSingle();
          if (error) return json({ error: error.message }, 400);
          if (data) await sb.from("policy_template_versions").insert(snapshot(data, nextVersion));
          await auditAction(sb, userId, "policy_template.updated", "policy_template", existingId, { name, new_version: nextVersion });
          return json({ template: data });
        }
        const { data, error } = await sb.from("policy_templates")
          .insert({ user_id: userId, builtin_id: builtinId, name, description, policy, settings, rules, applies_to_intents: tplIntents, unknown_intent_fallback: unknownIntentFallback, current_version: 1 })
          .select().maybeSingle();
        if (error) return json({ error: error.message }, 400);
        if (data) await sb.from("policy_template_versions").insert(snapshot(data, 1));
        await auditAction(sb, userId, "policy_template.created", "policy_template", data?.id ?? null, { name });
        return json({ template: data });
      }


      case "delete_policy_template": {
        const id = String(body?.id ?? "");
        if (!id) return json({ error: "id required" }, 400);
        const { data: row } = await sb.from("policy_templates").select("name,current_version")
          .eq("id", id).eq("user_id", userId).maybeSingle();
        const { error } = await sb.from("policy_templates").delete().eq("id", id).eq("user_id", userId);
        if (error) return json({ error: error.message }, 400);
        await auditAction(sb, userId, "policy_template.deleted", "policy_template", id, row ?? {});
        return json({ ok: true });
      }

      case "list_policy_template_versions": {
        const templateId = String(body?.template_id ?? url.searchParams.get("template_id") ?? "");
        if (!templateId) return json({ error: "template_id required" }, 400);
        // Confirm ownership before returning history.
        const { data: tpl } = await sb.from("policy_templates")
          .select("id,current_version").eq("id", templateId).eq("user_id", userId).maybeSingle();
        if (!tpl) return json({ error: "Template not found" }, 404);
        const { data, error } = await sb.from("policy_template_versions")
          .select("id,version,name,description,change_note,created_at,created_by,applies_to_intents,unknown_intent_fallback")
          .eq("template_id", templateId).eq("user_id", userId)
          .order("version", { ascending: false });
        if (error) return json({ error: error.message }, 400);
        return json({ current_version: tpl.current_version, versions: data ?? [] });
      }

      case "get_policy_template_version": {
        const templateId = String(body?.template_id ?? "");
        const version = Number(body?.version ?? 0);
        if (!templateId || !version) return json({ error: "template_id and version required" }, 400);
        const { data, error } = await sb.from("policy_template_versions")
          .select("*").eq("template_id", templateId).eq("user_id", userId).eq("version", version).maybeSingle();
        if (error) return json({ error: error.message }, 400);
        if (!data) return json({ error: "Version not found" }, 404);
        return json({ version: data });
      }

      case "rollback_policy_template": {
        const templateId = String(body?.template_id ?? "");
        const version = Number(body?.version ?? 0);
        if (!templateId || !version) return json({ error: "template_id and version required" }, 400);
        const { data: snap } = await sb.from("policy_template_versions")
          .select("*").eq("template_id", templateId).eq("user_id", userId).eq("version", version).maybeSingle();
        if (!snap) return json({ error: "Version not found" }, 404);
        const { data: existing } = await sb.from("policy_templates")
          .select("current_version").eq("id", templateId).eq("user_id", userId).maybeSingle();
        if (!existing) return json({ error: "Template not found" }, 404);
        const nextVersion = (existing.current_version ?? 1) + 1;
        const { data, error } = await sb.from("policy_templates")
          .update({
            name: snap.name, description: snap.description,
            policy: snap.policy, settings: snap.settings, rules: snap.rules,
            applies_to_intents: snap.applies_to_intents ?? [],
            unknown_intent_fallback: snap.unknown_intent_fallback ?? "apply_no_rules",
            current_version: nextVersion,
          })
          .eq("id", templateId).eq("user_id", userId).select().maybeSingle();
        if (error) return json({ error: error.message }, 400);
        if (data) {
          await sb.from("policy_template_versions").insert({
            template_id: data.id, user_id: userId, version: nextVersion,
            name: data.name, description: data.description,
            policy: data.policy, settings: data.settings, rules: data.rules,
            applies_to_intents: data.applies_to_intents ?? [],
            unknown_intent_fallback: data.unknown_intent_fallback ?? "apply_no_rules",
            change_note: `Rolled back to v${version}`,
            created_by: userId,
          });
        }
        await auditAction(sb, userId, "policy_template.rolled_back", "policy_template", templateId, {
          rolled_back_to_version: version,
          new_current_version: nextVersion,
          template_name: snap.name,
        });
        return json({ template: data });
      }

      // Evaluate an ad-hoc input against a template SNAPSHOT (its bundled
      // policy/settings/rules), without touching the caller's live config.
      // Powers the "Test prompts" panel on each policy template card.
      case "evaluate_template": {
        const inputText = typeof body?.input === "string" ? body.input : "";
        if (!inputText.trim()) return json({ error: "input required" }, 400);
        const tplPolicy = (body?.policy && typeof body.policy === "object") ? body.policy : {};
        const tplSettings = (body?.settings && typeof body.settings === "object") ? body.settings : {};
        const rawRules = Array.isArray(body?.rules) ? body.rules : [];

        const legacy = {
          blocked_keywords: Array.isArray(tplPolicy.blocked_keywords) ? tplPolicy.blocked_keywords : [],
          allowed_keywords: Array.isArray(tplPolicy.allowed_keywords) ? tplPolicy.allowed_keywords : [],
          use_global_defaults: tplPolicy.use_global_defaults !== false,
        };
        const settings = { ...DEFAULT_SETTINGS, ...tplSettings } as PolicySettings;

        const tplIntentScope = Array.isArray(body?.applies_to_intents)
          ? body.applies_to_intents.map((s: unknown) => String(s)).filter(Boolean)
          : [];
        const fallback = ["apply_no_rules", "apply_default_rules", "reject"].includes(
          String(body?.unknown_intent_fallback ?? ""),
        ) ? String(body.unknown_intent_fallback) : "apply_no_rules";

        // Optional simulation overrides used by the wizard "Test" step:
        // - force_intent: pretend the classifier returned this intent (skips
        //   the live LLM call so previews are deterministic and free).
        // - simulate_unknown: pretend the classifier returned no intent, to
        //   exercise the unknown-intent fallback branch.
        const simulateUnknown = body?.simulate_unknown === true;
        const forceIntent = !simulateUnknown && typeof body?.force_intent === "string" && body.force_intent.trim()
          ? body.force_intent.trim()
          : null;

        const allRules = rawRules
          .filter((r: any) => r && (r.kind === "regex" || r.kind === "detector"))
          .map((r: any, i: number) => ({
            id: r.id ?? `tpl-${i}`,
            name: String(r.name ?? `rule-${i}`),
            kind: r.kind,
            severity: r.severity ?? "high",
            direction: r.direction ?? "both",
            enabled: r.enabled !== false,
            config: r.config ?? {},
            applies_to_intents: Array.isArray(r.applies_to_intents) ? r.applies_to_intents : [],
          })) as PolicyRule[];

        // Resolve "applicable rules" for the simulation: a rule applies when
        // its own applies_to_intents is empty OR includes the forced intent.
        // Also dropped if the template's intent scope is non-empty and
        // doesn't include the forced intent.
        const intentForFilter = forceIntent;
        const isUnknownForFilter =
          !intentForFilter ||
          (tplIntentScope.length > 0 && !tplIntentScope.includes(intentForFilter));
        const applicableRules: PolicyRule[] = allRules.filter((r) => {
          if (!intentForFilter) return true; // no override → engine decides
          if (!r.applies_to_intents || r.applies_to_intents.length === 0) return true;
          return r.applies_to_intents.includes(intentForFilter);
        });
        const skippedRules = allRules.filter((r) => !applicableRules.includes(r))
          .map((r) => ({ id: r.id, name: r.name, applies_to_intents: r.applies_to_intents ?? [] }));

        // When simulating (force or unknown) we disable the live classifier
        // so the preview is deterministic and doesn't burn an LLM call.
        const evalSettings: PolicySettings = (forceIntent || simulateUnknown)
          ? { ...settings, enable_intent: false }
          : settings;

        const t0 = Date.now();
        try {
          const r = await evaluatePolicy({
            text: inputText, direction: "input",
            legacy, rules: applicableRules, intents: [], settings: evalSettings,
          });
          const detected = simulateUnknown ? null : (forceIntent ?? r.detected_intent ?? null);
          const isUnknown = simulateUnknown ? true : (forceIntent
            ? isUnknownForFilter
            : (!detected || (tplIntentScope.length > 0 && !tplIntentScope.includes(detected))));
          let verdict = r.verdict;
          let firedLayers = r.layers
            .filter((l) => l.verdict !== "allow")
            .map((l) => ({ layer: l.layer, verdict: l.verdict, rule: l.rule ?? null, reason: l.reason ?? null }));
          let fallbackApplied: string | null = null;
          if (isUnknown) {
            if (fallback === "apply_no_rules") {
              verdict = "allow";
              firedLayers = [];
              fallbackApplied = "apply_no_rules";
            } else if (fallback === "reject") {
              verdict = "block";
              firedLayers = [{ layer: "intent_fallback", verdict: "block", rule: null, reason: "Intent could not be detected — template configured to reject." }];
              fallbackApplied = "reject";
            } else {
              fallbackApplied = "apply_default_rules";
            }
          }
          return json({
            verdict,
            detected_intent: detected,
            forced_intent: forceIntent,
            unknown_intent_fallback_applied: fallbackApplied,
            applicable_rules: applicableRules.map((r) => ({
              id: r.id, name: r.name, kind: r.kind, severity: r.severity,
              applies_to_intents: r.applies_to_intents ?? [],
            })),
            skipped_rules: skippedRules,
            fired_layers: firedLayers,
            latency_ms: Date.now() - t0,
          });
        } catch (e) {
          return json({ verdict: "error", error: (e as Error).message, latency_ms: Date.now() - t0 }, 200);
        }
      }


      // Run the bundled red-team corpus through the live policy engine using
      // the caller's actual settings/rules/intents/legacy keywords. Returns
      // pass/fail per case so the dashboard can surface evasions before release.
      case "get_drift_report": {
        // Behavior drift (learning loop): compare a recent window vs a baseline
        // window of request_logs and surface significant shifts in block/flag
        // rate and intent mix. Tenant-scoped via `sb`.
        const now = Date.now();
        const recentHours = Math.min(168, Math.max(1, Number(body?.recent_hours) || 24));
        const baselineDays = Math.min(90, Math.max(1, Number(body?.baseline_days) || 7));
        const recentSince = new Date(now - recentHours * 3600_000).toISOString();
        const baselineSince = new Date(now - baselineDays * 86400_000).toISOString();
        const cols = "verdict,status,detected_intent,created_at";
        const [recentRes, baseRes] = await Promise.all([
          sb.from("request_logs").select(cols).gte("created_at", recentSince).limit(10000),
          sb.from("request_logs").select(cols).gte("created_at", baselineSince).lt("created_at", recentSince).limit(50000),
        ]);
        const summarize = (rows: any[]) => {
          const n = rows.length || 1;
          const blocked = rows.filter((r) => String(r.status ?? "").startsWith("blocked")).length;
          const flagged = rows.filter((r) => r.verdict === "flag").length;
          const intents: Record<string, number> = {};
          for (const r of rows) { const i = r.detected_intent || "unknown"; intents[i] = (intents[i] ?? 0) + 1; }
          return { total: rows.length, block_rate: blocked / n, flag_rate: flagged / n, intents };
        };
        const recent = summarize(recentRes.data ?? []);
        const baseline = summarize(baseRes.data ?? []);
        const rel = (a: number, b: number) => b === 0 ? (a > 0 ? 1 : 0) : (a - b) / b;
        const blockDrift = rel(recent.block_rate, baseline.block_rate);
        const flagDrift = rel(recent.flag_rate, baseline.flag_rate);
        const alerts: string[] = [];
        if (recent.total >= 20 && Math.abs(blockDrift) >= 0.5) {
          alerts.push(`Block rate ${blockDrift > 0 ? "up" : "down"} ${Math.round(Math.abs(blockDrift) * 100)}% (${(recent.block_rate * 100).toFixed(1)}% vs ${(baseline.block_rate * 100).toFixed(1)}% baseline).`);
        }
        if (recent.total >= 20 && Math.abs(flagDrift) >= 0.5) {
          alerts.push(`Flag rate ${flagDrift > 0 ? "up" : "down"} ${Math.round(Math.abs(flagDrift) * 100)}% vs baseline.`);
        }
        const intentShifts: { intent: string; recent: number; baseline: number; delta: number }[] = [];
        for (const i of new Set([...Object.keys(recent.intents), ...Object.keys(baseline.intents)])) {
          const rShare = (recent.intents[i] ?? 0) / (recent.total || 1);
          const bShare = (baseline.intents[i] ?? 0) / (baseline.total || 1);
          const delta = rShare - bShare;
          if (Math.abs(delta) >= 0.1) intentShifts.push({ intent: i, recent: rShare, baseline: bShare, delta });
        }
        intentShifts.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
        return json({
          window: { recent_hours: recentHours, baseline_days: baselineDays },
          recent, baseline,
          drift: { block_rate_change: blockDrift, flag_rate_change: flagDrift, intent_shifts: intentShifts.slice(0, 8) },
          alerts,
          has_drift: alerts.length > 0 || intentShifts.length > 0,
        });
      }

      case "run_policy_harness": {
        const [legacyRes, settingsRes, rulesRes, intentsRes] = await Promise.all([
          sb.from("policies").select("*").eq("user_id", userId).maybeSingle(),
          sb.from("policy_settings").select("*").eq("user_id", userId).maybeSingle(),
          sb.from("policy_rules").select("*").eq("user_id", userId).eq("enabled", true),
          sb.from("policy_intents").select("*").eq("user_id", userId),
        ]);
        const legacy = {
          blocked_keywords: legacyRes.data?.blocked_keywords ?? [],
          allowed_keywords: legacyRes.data?.allowed_keywords ?? [],
          use_global_defaults: legacyRes.data?.use_global_defaults !== false,
        };
        const rules = (rulesRes.data ?? []) as PolicyRule[];
        const intents = (intentsRes.data ?? []) as PolicyIntent[];
        const settings = (settingsRes.data ?? DEFAULT_SETTINGS) as PolicySettings;

        // Optional filter — run only specific case ids when the UI re-tests one.
        const onlyIds = Array.isArray(body?.case_ids)
          ? new Set(body.case_ids.map((s: unknown) => String(s)))
          : null;
        const cases = onlyIds ? HARNESS_CASES.filter((c) => onlyIds.has(c.id)) : HARNESS_CASES;

        // "Block" and "sanitize" both count as mitigations. "flag" must match.
        const matches = (expected: ExpectedVerdict, actual: string) => {
          if (expected === "block") return actual === "block" || actual === "sanitize";
          if (expected === "sanitize") return actual === "sanitize" || actual === "block";
          if (expected === "flag") return actual === "flag" || actual === "block" || actual === "sanitize";
          return actual === "allow";
        };

        const results = await Promise.all(cases.map(async (c) => {
          const t0 = Date.now();
          try {
            const r = await evaluatePolicy({
              text: c.prompt,
              direction: "input",
              legacy, rules, intents, settings,
              conversation: c.conversation,
            });
            const passed = matches(c.expected, r.verdict);
            return {
              id: c.id,
              category: c.category,
              prompt: c.prompt,
              notes: c.notes ?? null,
              expected: c.expected,
              verdict: r.verdict,
              passed,
              detected_intent: r.detected_intent ?? null,
              fired_layers: r.layers
                .filter((l) => l.verdict !== "allow")
                .map((l) => ({ layer: l.layer, verdict: l.verdict, rule: l.rule ?? null, reason: l.reason ?? null })),
              latency_ms: Date.now() - t0,
            };
          } catch (e) {
            return {
              id: c.id, category: c.category, prompt: c.prompt, notes: c.notes ?? null,
              expected: c.expected, verdict: "error", passed: false,
              detected_intent: null, fired_layers: [],
              error: (e as Error).message, latency_ms: Date.now() - t0,
            };
          }
        }));

        const summary = {
          total: results.length,
          passed: results.filter((r) => r.passed).length,
          failed: results.filter((r) => !r.passed).length,
          by_category: {} as Record<string, { total: number; passed: number }>,
        };
        for (const r of results) {
          const k = summary.by_category[r.category] ?? { total: 0, passed: 0 };
          k.total++;
          if (r.passed) k.passed++;
          summary.by_category[r.category] = k;
        }
        return json({ summary, results });
      }

      // ---- Incident -> regression tests (Triage-parity Wave 5) -------------
      case "create_regression_from_log": {
        const logId = String(body?.log_id ?? "");
        if (!logId) return json({ error: "log_id required" }, 400);
        const { data: log } = await sb.from("request_logs")
          .select("id, messages, response, verdict, status").eq("id", logId).maybeSingle();
        if (!log) return json({ error: "Log not found" }, 404);
        // Derive the capture direction from the log's block side when the caller
        // doesn't specify it — an output-blocked log must replay as "output",
        // else it returns allow != block and the saved test is red on first run.
        const direction = (body?.direction === "output" || body?.direction === "input")
          ? body.direction
          : (String((log as any).status ?? "").startsWith("blocked_output") ? "output" : "input");
        const flatten = (msgs: any): string => Array.isArray(msgs)
          ? msgs.map((m: any) => typeof m?.content === "string" ? m.content : JSON.stringify(m?.content ?? "")).join("\n")
          : "";
        const r = log.response as any;
        const assistantText = typeof r?.choices?.[0]?.message?.content === "string"
          ? r.choices[0].message.content
          : Array.isArray(r?.content)  // Anthropic: content is an array of blocks
            ? r.content.filter((b: any) => b?.type === "text").map((b: any) => b?.text ?? "").join("")
            : (typeof r?.content === "string" ? r.content : "");
        const input = direction === "input" ? flatten(log.messages) : assistantText;
        if (!input) return json({ error: "Log has no replayable text for that direction" }, 400);
        const expected = ["allow", "flag", "block", "sanitize"].includes(String(body?.expected_verdict))
          ? String(body.expected_verdict) : (log.verdict ?? "block");
        const name = (String(body?.name ?? "").trim() || `Captured ${new Date().toISOString().slice(0, 10)}`).slice(0, 120);
        const { data, error } = await sb.from("regression_tests")
          .insert({ name, input, direction, expected_verdict: expected, source_log_id: logId, enabled: true })
          .select("id").single();
        if (error) return json({ error: error.message }, 400);
        await auditAction(sb, userId, "regression_test.created", "regression_test", data.id, { source_log_id: logId, direction, expected });
        return json({ ok: true, id: data.id });
      }

      case "list_regression_tests": {
        const { data } = await sb.from("regression_tests").select("*")
          .eq("user_id", userId).order("created_at", { ascending: false });
        return json({ tests: data ?? [] });
      }

      case "delete_regression_test": {
        const id = String(body?.id ?? "");
        if (!id) return json({ error: "id required" }, 400);
        const { error } = await sb.from("regression_tests").delete().eq("id", id);
        if (error) return json({ error: error.message }, 400);
        await auditAction(sb, userId, "regression_test.deleted", "regression_test", id, {});
        return json({ ok: true });
      }

      case "toggle_regression_test": {
        const id = String(body?.id ?? "");
        if (!id) return json({ error: "id required" }, 400);
        const { error } = await sb.from("regression_tests").update({ enabled: !!body?.enabled }).eq("id", id);
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true });
      }

      // ---- Wave 4: Counterfactual Policy Replay -----------------------------
      // Re-runs an existing request log through the engine with arbitrary
      // setting overrides. Read-only — never mutates the source log. Lets ops
      // ask "what would have happened if I had enabled tool governance / a
      // lower jailbreak threshold / the new threat-intel feed" against real
      // historical traffic, before flipping switches in production.
      case "replay_log_with_policy": {
        const logId = String(body?.log_id ?? "");
        if (!logId) return json({ error: "log_id required" }, 400);
        const overrides = (body?.override_settings && typeof body.override_settings === "object")
          ? body.override_settings as Record<string, unknown>
          : {};
        const direction = body?.direction === "output" ? "output" : "input";
        const { data: log } = await sb.from("request_logs")
          .select("id, messages, response, verdict, model, status")
          .eq("id", logId).maybeSingle();
        if (!log) return json({ error: "Log not found" }, 404);
        const flatten = (msgs: any): string => Array.isArray(msgs)
          ? msgs.map((m: any) => typeof m?.content === "string" ? m.content : JSON.stringify(m?.content ?? "")).join("\n")
          : "";
        const r = log.response as any;
        const assistantText = typeof r?.choices?.[0]?.message?.content === "string"
          ? r.choices[0].message.content
          : (Array.isArray(r?.content)
              ? r.content.filter((b: any) => b?.type === "text").map((b: any) => b.text).join("")
              : (typeof r?.content === "string" ? r.content : ""));
        const text = direction === "input" ? flatten(log.messages) : assistantText;
        if (!text) return json({ error: "Log has no replayable text for that direction" }, 400);

        // Load the current workspace policy, then apply overrides.
        const [legacyRes, settingsRes, rulesRes, intentsRes] = await Promise.all([
          sb.from("policies").select("*").eq("user_id", userId).maybeSingle(),
          sb.from("policy_settings").select("*").eq("user_id", userId).maybeSingle(),
          sb.from("policy_rules").select("*").eq("user_id", userId).eq("enabled", true),
          sb.from("policy_intents").select("*").eq("user_id", userId),
        ]);
        const baseSettings = (settingsRes.data ?? DEFAULT_SETTINGS) as PolicySettings;
        // Replay is deterministic by default — LLM layers off so the same
        // input yields the same verdict every run.
        const settings = {
          ...baseSettings,
          enable_intent: false,
          enable_semantic_keywords: false,
          enable_model_jailbreak_classifier: false,
          enable_trained_classifier: false,
          ...overrides,
        } as PolicySettings;

        const legacy = {
          blocked_keywords: legacyRes.data?.blocked_keywords ?? [],
          allowed_keywords: legacyRes.data?.allowed_keywords ?? [],
          use_global_defaults: legacyRes.data?.use_global_defaults !== false,
        };
        const rules = (rulesRes.data ?? []) as PolicyRule[];
        const intents = (intentsRes.data ?? []) as PolicyIntent[];
        const res = await evaluatePolicy({
          text, direction, legacy, rules, intents, settings,
        }, { model: log.model });

        return json({
          log_id: logId,
          direction,
          original_verdict: log.verdict ?? null,
          original_status: log.status ?? null,
          replay_verdict: res.verdict,
          replay_layers: res.layers.map((l) => ({
            layer: l.layer, verdict: l.verdict, rule: l.rule ?? null,
            reason: l.reason ?? null, confidence: l.confidence ?? null,
          })),
          changed: (log.verdict ?? "allow") !== res.verdict,
          overrides_applied: Object.keys(overrides),
        });
      }

      case "run_regression_tests": {
        const [legacyRes, settingsRes, rulesRes, intentsRes] = await Promise.all([
          sb.from("policies").select("*").eq("user_id", userId).maybeSingle(),
          sb.from("policy_settings").select("*").eq("user_id", userId).maybeSingle(),
          sb.from("policy_rules").select("*").eq("user_id", userId).eq("enabled", true),
          sb.from("policy_intents").select("*").eq("user_id", userId),
        ]);
        const legacy = {
          blocked_keywords: legacyRes.data?.blocked_keywords ?? [],
          allowed_keywords: legacyRes.data?.allowed_keywords ?? [],
          use_global_defaults: legacyRes.data?.use_global_defaults !== false,
        };
        const rules = (rulesRes.data ?? []) as PolicyRule[];
        const intents = (intentsRes.data ?? []) as PolicyIntent[];
        // Replay with deterministic layers only — disable LLM-backed layers so
        // results are reproducible and don't bill per run.
        const settings = {
          ...((settingsRes.data ?? DEFAULT_SETTINGS) as PolicySettings),
          enable_intent: false,
          enable_semantic_keywords: false,
          enable_model_jailbreak_classifier: false,
        } as PolicySettings;

        let q = sb.from("regression_tests").select("*").eq("enabled", true);
        if (Array.isArray(body?.ids) && body.ids.length) q = q.in("id", body.ids.map((s: unknown) => String(s)));
        const { data: cases } = await q;

        const matches = (expected: string, actual: string) => {
          if (expected === "block") return actual === "block" || actual === "sanitize";
          if (expected === "sanitize") return actual === "sanitize" || actual === "block";
          if (expected === "flag") return actual === "flag" || actual === "block" || actual === "sanitize";
          return actual === "allow";
        };

        const results = await Promise.all((cases ?? []).map(async (c: any) => {
          const res = await evaluatePolicy({
            text: c.input,
            direction: c.direction === "output" ? "output" : "input",
            legacy, rules, intents, settings,
          });
          const passed = matches(c.expected_verdict, res.verdict);
          await sb.from("regression_tests").update({
            last_run_verdict: res.verdict, last_run_passed: passed, last_run_at: new Date().toISOString(),
          }).eq("id", c.id);
          return {
            id: c.id, name: c.name, direction: c.direction,
            expected: c.expected_verdict, verdict: res.verdict, passed,
            fired_layers: res.layers.filter((l) => l.verdict !== "allow")
              .map((l) => ({ layer: l.layer, verdict: l.verdict, rule: l.rule ?? null })),
          };
        }));
        await auditAction(sb, userId, "regression_test.run", "regression_test", null,
          { total: results.length, failed: results.filter((r) => !r.passed).length });
        return json({
          summary: {
            total: results.length,
            passed: results.filter((r) => r.passed).length,
            failed: results.filter((r) => !r.passed).length,
          },
          results,
        });
      }

      // Run a single ad-hoc input (and optional output) through the live policy
      // engine using the caller's actual settings/rules/intents/legacy keywords.
      // Powers the Policy sandbox per-layer breakdown.
      case "evaluate_policy": {
        const inputText = typeof body?.input === "string" ? body.input : "";
        const outputText = typeof body?.output === "string" ? body.output : "";
        const checkOutput = !!body?.check_output && outputText.length > 0;

        const [legacyRes, settingsRes, rulesRes, intentsRes] = await Promise.all([
          sb.from("policies").select("*").eq("user_id", userId).maybeSingle(),
          sb.from("policy_settings").select("*").eq("user_id", userId).maybeSingle(),
          sb.from("policy_rules").select("*").eq("user_id", userId).eq("enabled", true),
          sb.from("policy_intents").select("*").eq("user_id", userId),
        ]);
        const legacy = {
          blocked_keywords: legacyRes.data?.blocked_keywords ?? [],
          allowed_keywords: legacyRes.data?.allowed_keywords ?? [],
          use_global_defaults: legacyRes.data?.use_global_defaults !== false,
        };
        const rules = (rulesRes.data ?? []) as PolicyRule[];
        const intents = (intentsRes.data ?? []) as PolicyIntent[];
        const settings = (settingsRes.data ?? DEFAULT_SETTINGS) as PolicySettings;

        const blockMessage = legacyRes.data?.block_message ?? "Request blocked by policy.";

        const runOne = async (text: string, direction: "input" | "output") => {
          const t0 = Date.now();
          try {
            const r = await evaluatePolicy({
              text, direction, legacy, rules, intents, settings,
            });
            return { ok: true as const, result: r, latency_ms: Date.now() - t0 };
          } catch (e) {
            return { ok: false as const, error: (e as Error).message, latency_ms: Date.now() - t0 };
          }
        };

        const input = inputText ? await runOne(inputText, "input") : null;
        const output = checkOutput ? await runOne(outputText, "output") : null;

        return json({
          input, output,
          block_message: blockMessage,
          settings_summary: {
            enable_normalizer: settings.enable_normalizer,
            enable_patterns: settings.enable_patterns,
            enable_heuristics: settings.enable_heuristics,
            enable_intent: settings.enable_intent,
            enable_injection_guard: settings.enable_injection_guard,
            enable_behavioral: settings.enable_behavioral,
            enable_fuzzy_keywords: settings.enable_fuzzy_keywords,
            enable_semantic_keywords: settings.enable_semantic_keywords,
            strict_mode: settings.strict_mode,
            intent_shadow_mode: settings.intent_shadow_mode,
          },
          counts: { rules: rules.length, intents: intents.length, blocked_keywords: legacy.blocked_keywords.length },
        });
      }

      case "list_logs": {
        const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 500);
        const status = url.searchParams.get("status");
        let q = sb.from("request_logs")
          .select("id,api_key_id,provider,model,status,block_reason,latency_ms,tokens_in,tokens_out,created_at,messages,response,verdict,verdict_layers,detected_intent,intent_confidence,guardrail_prompt,client_system_prompt,request_id,upstream_latency_ms,egress_domain,egress_allowed,tools_requested,tools_names,tool_governance_verdict,response_tool_calls")
          .eq("user_id", userId).order("created_at", { ascending: false }).limit(limit);
        if (status && status !== "all") q = q.eq("status", status);
        const { data } = await q;
        const { data: keys } = await sb.from("api_keys").select("id,name").eq("user_id", userId);
        const keyMap = new Map((keys ?? []).map((k) => [k.id, k.name]));
        return json({ logs: (data ?? []).map((l) => ({ ...l, api_key_name: keyMap.get(l.api_key_id) ?? "—" })) });
      }

      // Surfaces a spike in blocked_input events: compares the last 24h against
      // a 7-day rolling baseline (per-day average over the prior 7 days). A
      // spike fires when last24h is at least 2x the baseline AND ≥5 events,
      // so quiet workspaces don't get noisy when a couple of blocks happen.
      // Also returns the top API keys by blocked_input count in the window.
      case "block_spike_alert": {
        const now = Date.now();
        const since24 = new Date(now - 24 * 3600 * 1000).toISOString();
        const since8d = new Date(now - 8 * 24 * 3600 * 1000).toISOString();
        const { data: rows, error } = await sb.from("request_logs")
          .select("api_key_id,created_at,status")
          .eq("user_id", userId)
          .eq("status", "blocked_input")
          .gte("created_at", since8d)
          .limit(5000);
        if (error) return json({ error: error.message }, 400);

        const cutoff24 = now - 24 * 3600 * 1000;
        const last24: any[] = [];
        const prior7: any[] = [];
        for (const r of rows ?? []) {
          const t = new Date(r.created_at).getTime();
          if (t >= cutoff24) last24.push(r);
          else prior7.push(r);
        }
        // Baseline = average per-24h over the prior 7 days.
        const baseline = prior7.length / 7;
        const last24Count = last24.length;

        // Per-key counts in the 24h window, with prior-7d baseline per key.
        const keyCounts = new Map<string, { last24: number; prior7: number }>();
        for (const r of last24) {
          const k = r.api_key_id ?? "unknown";
          const v = keyCounts.get(k) ?? { last24: 0, prior7: 0 };
          v.last24++; keyCounts.set(k, v);
        }
        for (const r of prior7) {
          const k = r.api_key_id ?? "unknown";
          const v = keyCounts.get(k) ?? { last24: 0, prior7: 0 };
          v.prior7++; keyCounts.set(k, v);
        }
        const { data: keys } = await sb.from("api_keys")
          .select("id,name,key_prefix").eq("user_id", userId);
        const keyMeta = new Map((keys ?? []).map((k) => [k.id, k]));

        const minEvents = 5;
        const ratioThreshold = 2;
        const ratio = baseline > 0 ? last24Count / baseline : (last24Count >= minEvents ? Infinity : 0);
        const spike = last24Count >= minEvents && (baseline === 0 || ratio >= ratioThreshold);

        const topKeys = Array.from(keyCounts.entries())
          .map(([api_key_id, v]) => {
            const meta = keyMeta.get(api_key_id) as any;
            const keyBaseline = v.prior7 / 7;
            const keyRatio = keyBaseline > 0 ? v.last24 / keyBaseline : (v.last24 >= 3 ? Infinity : 0);
            return {
              api_key_id,
              api_key_name: meta?.name ?? "—",
              api_key_prefix: meta?.key_prefix ?? null,
              blocked_24h: v.last24,
              baseline_per_24h: Number(keyBaseline.toFixed(2)),
              ratio: Number.isFinite(keyRatio) ? Number(keyRatio.toFixed(2)) : null,
              spike: v.last24 >= 3 && (keyBaseline === 0 || keyRatio >= ratioThreshold),
            };
          })
          .filter((k) => k.blocked_24h > 0)
          .sort((a, b) => b.blocked_24h - a.blocked_24h)
          .slice(0, 5);

        return json({
          spike,
          last_24h: last24Count,
          baseline_per_24h: Number(baseline.toFixed(2)),
          ratio: Number.isFinite(ratio) ? Number(ratio.toFixed(2)) : null,
          threshold: { min_events: minEvents, ratio: ratioThreshold },
          top_keys: topKeys,
          window_hours: 24,
        });
      }

      // Token usage spike detector — compares the most recent N-hour window
      // against the same-length windows over the prior 7 days. Surfaces both
      // tokens_in and tokens_out spikes with per-key attribution.
      case "token_spike_alert": {
        const { data: settings } = await sb.from("policy_settings")
          .select("token_spike_alert_enabled,token_spike_window_hours,token_spike_min_tokens,token_spike_ratio,token_spike_webhook_url,severity_baseline_days,severity_volume_dampening,severity_score_cap")
          .eq("user_id", userId).maybeSingle();
        const enabled = settings?.token_spike_alert_enabled !== false;
        const windowH = Math.max(1, Math.min(24, Number(settings?.token_spike_window_hours ?? 1)));
        const minTokens = Math.max(0, Number(settings?.token_spike_min_tokens ?? 10000));
        const ratioThreshold = Math.max(1.1, Number(settings?.token_spike_ratio ?? 3));
        const baselineDays = Math.max(1, Math.min(30, Number(settings?.severity_baseline_days ?? 7)));
        const volumeDampening = Math.max(0, Math.min(1, Number(settings?.severity_volume_dampening ?? 0.6)));
        const scoreCap = Math.max(1, Math.min(100, Number(settings?.severity_score_cap ?? 100)));

        const now = Date.now();
        const windowMs = windowH * 3600 * 1000;
        // Pull enough history to fill `baselineDays` worth of same-length windows.
        const baselineWindows = Math.max(1, Math.floor((baselineDays * 24) / windowH));
        const sinceISO = new Date(now - (baselineWindows + 1) * windowMs).toISOString();
        const { data: rows, error } = await sb.from("request_logs")
          .select("api_key_id,created_at,tokens_in,tokens_out")
          .eq("user_id", userId)
          .gte("created_at", sinceISO)
          .limit(20000);
        if (error) return json({ error: error.message }, 400);

        const cutoff = now - windowMs;
        let curIn = 0, curOut = 0;
        let priorIn = 0, priorOut = 0;
        const perKey = new Map<string, { in: number; out: number; priorIn: number; priorOut: number }>();
        for (const r of rows ?? []) {
          const t = new Date(r.created_at).getTime();
          const ti = r.tokens_in ?? 0;
          const to = r.tokens_out ?? 0;
          const k = r.api_key_id ?? "unknown";
          const v = perKey.get(k) ?? { in: 0, out: 0, priorIn: 0, priorOut: 0 };
          if (t >= cutoff) { curIn += ti; curOut += to; v.in += ti; v.out += to; }
          else { priorIn += ti; priorOut += to; v.priorIn += ti; v.priorOut += to; }
          perKey.set(k, v);
        }
        // Baseline = average tokens per *current-window-length* over the
        // configured number of prior windows. Comparable to current window.
        const baselineIn = priorIn / baselineWindows;
        const baselineOut = priorOut / baselineWindows;
        const ratioIn = baselineIn > 0 ? curIn / baselineIn : (curIn >= minTokens ? Infinity : 0);
        const ratioOut = baselineOut > 0 ? curOut / baselineOut : (curOut >= minTokens ? Infinity : 0);
        const spikeIn = enabled && curIn >= minTokens && (baselineIn === 0 || ratioIn >= ratioThreshold);
        const spikeOut = enabled && curOut >= minTokens && (baselineOut === 0 || ratioOut >= ratioThreshold);
        const spike = spikeIn || spikeOut;

        // Severity model: 0..100 based on how far above the configured spike
        // threshold the worst of (ratio_in, ratio_out) lands, on a log scale
        // so 1× threshold ≈ 25, 2× ≈ ~58, 4× ≈ ~92, 8×+ saturates at 100.
        // Below threshold we still give a small score (0..24) proportional to
        // how close it is so operators can see things "trending up".
        // Volume gate: below `min_tokens`, the score is multiplied by
        // (volume/floor) × `severity_volume_dampening`, then clamped to
        // `severity_score_cap` so operators can cap loud alerts.
        const scoreFromRatio = (ratio: number, volume: number): number => {
          if (!Number.isFinite(ratio) && ratio > 0) return Math.min(100, scoreCap);
          if (ratio <= 0) return 0;
          const t = ratioThreshold;
          let s: number;
          if (ratio < t) {
            s = Math.max(0, Math.min(24, Math.round((ratio / t) * 24)));
          } else {
            const over = Math.log2(Math.max(1, ratio / t));
            s = Math.min(100, Math.round(25 + over * 25));
          }
          const floor = Math.max(1, minTokens);
          if (volume < floor) s = Math.round(s * (volume / floor) * volumeDampening);
          return Math.max(0, Math.min(scoreCap, s));
        };
        const severityScore = Math.max(
          scoreFromRatio(ratioIn, curIn),
          scoreFromRatio(ratioOut, curOut),
        );
        const severityLevel: "none" | "low" | "medium" | "high" | "critical" =
          severityScore >= 85 ? "critical" :
          severityScore >= 60 ? "high" :
          severityScore >= 35 ? "medium" :
          severityScore >= 10 ? "low" : "none";

        const { data: keys } = await sb.from("api_keys")
          .select("id,name,key_prefix").eq("user_id", userId);
        const keyMeta = new Map((keys ?? []).map((k) => [k.id, k]));
        const topKeys = Array.from(perKey.entries())
          .map(([api_key_id, v]) => {
            const meta = keyMeta.get(api_key_id) as any;
            const bIn = v.priorIn / baselineWindows, bOut = v.priorOut / baselineWindows;
            const rIn = bIn > 0 ? v.in / bIn : (v.in >= Math.max(1000, minTokens / 4) ? Infinity : 0);
            const rOut = bOut > 0 ? v.out / bOut : (v.out >= Math.max(1000, minTokens / 4) ? Infinity : 0);
            const keySeverity = Math.max(
              scoreFromRatio(rIn, v.in),
              scoreFromRatio(rOut, v.out),
            );
            return {
              api_key_id,
              api_key_name: meta?.name ?? "—",
              api_key_prefix: meta?.key_prefix ?? null,
              tokens_in: v.in,
              tokens_out: v.out,
              baseline_in: Math.round(bIn),
              baseline_out: Math.round(bOut),
              ratio_in: Number.isFinite(rIn) ? Number(rIn.toFixed(2)) : null,
              ratio_out: Number.isFinite(rOut) ? Number(rOut.toFixed(2)) : null,
              severity_score: keySeverity,
              severity_level:
                keySeverity >= 85 ? "critical" :
                keySeverity >= 60 ? "high" :
                keySeverity >= 35 ? "medium" :
                keySeverity >= 10 ? "low" : "none",
              spike: (v.in + v.out) >= Math.max(1000, minTokens / 4) &&
                ((bIn === 0 && v.in > 0) || rIn >= ratioThreshold ||
                 (bOut === 0 && v.out > 0) || rOut >= ratioThreshold),
            };
          })
          .filter((k) => (k.tokens_in + k.tokens_out) > 0)
          .sort((a, b) =>
            (b.severity_score - a.severity_score) ||
            ((b.tokens_in + b.tokens_out) - (a.tokens_in + a.tokens_out))
          )
          .slice(0, 5);

        // Fire-and-forget webhook (non-blocking, best-effort).
        if (spike && settings?.token_spike_webhook_url) {
          try {
            // deno-lint-ignore no-explicit-any
            (globalThis as any).EdgeRuntime?.waitUntil?.(
              fetch(settings.token_spike_webhook_url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  type: "token_spike",
                  user_id: userId,
                  window_hours: windowH,
                  tokens_in: curIn, tokens_out: curOut,
                  baseline_in: Math.round(baselineIn), baseline_out: Math.round(baselineOut),
                  ratio_in: Number.isFinite(ratioIn) ? Number(ratioIn.toFixed(2)) : null,
                  ratio_out: Number.isFinite(ratioOut) ? Number(ratioOut.toFixed(2)) : null,
                  severity_score: severityScore,
                  severity_level: severityLevel,
                  top_keys: topKeys,
                  ts: new Date().toISOString(),
                }),
              }).catch(() => {}),
            );
          } catch (_) { /* ignore */ }
        }

        return json({
          enabled,
          spike,
          spike_in: spikeIn,
          spike_out: spikeOut,
          window_hours: windowH,
          tokens_in: curIn,
          tokens_out: curOut,
          baseline_in: Math.round(baselineIn),
          baseline_out: Math.round(baselineOut),
          ratio_in: Number.isFinite(ratioIn) ? Number(ratioIn.toFixed(2)) : null,
          ratio_out: Number.isFinite(ratioOut) ? Number(ratioOut.toFixed(2)) : null,
          severity_score: severityScore,
          severity_level: severityLevel,
          threshold: { min_tokens: minTokens, ratio: ratioThreshold },
          calibration: {
            baseline_days: baselineDays,
            baseline_windows: baselineWindows,
            volume_dampening: volumeDampening,
            score_cap: scoreCap,
          },
          top_keys: topKeys,
        });
      }
      // Server-only table; the dashboard function is the sole writer/reader,
      // so this endpoint is the only way the UI surfaces these events.
      // ===================================================================
      // Alert subscriptions (audit Sprint 9). Operators register webhooks
      // that fire on block/token spikes or specific audit verbs. The actual
      // delivery engine (cron-based) is a separate work item; these actions
      // land the data model + CRUD so the UI can be built independently.
      // ===================================================================
      case "list_alert_subscriptions": {
        const { data, error } = await sb.from("alert_subscriptions")
          .select("id,name,kind,target_url,threshold_value,threshold_window_minutes,audit_action_filter,cooldown_minutes,enabled,last_fired_at,fire_count,created_at,updated_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false });
        if (error) return json({ error: error.message }, 400);
        // Mask webhook_secret in the response — it's set-only via save_*.
        return json({ subscriptions: (data ?? []).map((r) => ({ ...r, has_secret: false })) });
      }

      case "save_alert_subscription": {
        const id = body?.id ? String(body.id) : null;
        const name = String(body?.name ?? "").trim().slice(0, 100);
        const kind = String(body?.kind ?? "");
        const targetUrl = String(body?.target_url ?? "").trim();
        const thresholdValue = body?.threshold_value !== undefined ? Number(body.threshold_value) : null;
        const windowMin = Number(body?.threshold_window_minutes ?? 5);
        const cooldownMin = Number(body?.cooldown_minutes ?? 5);
        const auditFilter = Array.isArray(body?.audit_action_filter)
          ? body.audit_action_filter.map((s: unknown) => String(s)).filter(Boolean).slice(0, 50)
          : null;
        const enabled = body?.enabled !== false;
        const webhookSecret = body?.webhook_secret !== undefined ? (body.webhook_secret ? String(body.webhook_secret).slice(0, 200) : null) : undefined;

        if (!name) return json({ error: "name is required" }, 400);
        if (!["block_spike", "token_spike", "audit_event"].includes(kind)) {
          return json({ error: "kind must be block_spike, token_spike, or audit_event" }, 400);
        }
        if (kind !== "audit_event" && (thresholdValue === null || !Number.isFinite(thresholdValue) || thresholdValue < 1)) {
          return json({ error: "threshold_value (≥1) is required for spike alerts" }, 400);
        }
        if (!Number.isInteger(windowMin) || windowMin < 1 || windowMin > 1440) {
          return json({ error: "threshold_window_minutes must be 1-1440" }, 400);
        }
        if (!Number.isInteger(cooldownMin) || cooldownMin < 0 || cooldownMin > 1440) {
          return json({ error: "cooldown_minutes must be 0-1440" }, 400);
        }
        const validation = validateWebhookUrl(targetUrl);
        if (!validation.ok) return json({ error: `invalid target_url: ${validation.reason}` }, 400);

        const row: Record<string, unknown> = {
          user_id: userId, name, kind, target_url: validation.url.toString(),
          threshold_value: kind === "audit_event" ? null : thresholdValue,
          threshold_window_minutes: windowMin,
          audit_action_filter: kind === "audit_event" ? auditFilter : null,
          cooldown_minutes: cooldownMin,
          enabled,
        };
        // Only update webhook_secret when explicitly provided (so editing
        // other fields doesn't accidentally clear it).
        if (webhookSecret !== undefined) row.webhook_secret = webhookSecret;

        if (id) {
          const { data, error } = await sb.from("alert_subscriptions")
            .update(row).eq("id", id).eq("user_id", userId)
            .select("id").maybeSingle();
          if (error) return json({ error: error.message }, 400);
          if (!data) return json({ error: "Alert subscription not found" }, 404);
          await auditAction(sb, userId, "alert_subscription.updated", "alert_subscription", id, { name, kind, target_url: validation.url.host });
          return json({ ok: true, id });
        }
        const { data, error } = await sb.from("alert_subscriptions")
          .insert(row).select("id").single();
        if (error) return json({ error: error.message }, 400);
        await auditAction(sb, userId, "alert_subscription.created", "alert_subscription", data!.id, { name, kind, target_url: validation.url.host });
        return json({ ok: true, id: data!.id });
      }

      // Test fire — POSTs a synthetic probe payload to the configured
      // webhook regardless of threshold. Lets operators verify their
      // receiver works before relying on real alerts.
      case "test_alert_subscription": {
        const id = String(body?.id ?? "");
        if (!id) return json({ error: "id required" }, 400);
        const { data: sub } = await sb.from("alert_subscriptions")
          .select("id,name,kind,target_url,webhook_secret")
          .eq("id", id).eq("user_id", userId).maybeSingle();
        if (!sub) return json({ error: "Alert subscription not found" }, 404);

        const { postWebhook } = await import("../_shared/webhook.ts");
        const result = await postWebhook(sub.target_url, {
          service: "anveguard",
          subscription_id: sub.id,
          subscription_name: sub.name,
          fired_at: new Date().toISOString(),
          kind: sub.kind,
          test: true,
          message: "This is a test payload from the AnveGuard dashboard. If you see this, your webhook is wired correctly.",
        }, { secret: sub.webhook_secret, timeoutMs: 8_000 });

        await auditAction(sb, userId, "alert_subscription.test_fired", "alert_subscription", id, {
          delivery_status: result.status, delivery_ms: result.duration_ms, error: result.error ?? null,
        });
        return json({
          ok: result.ok,
          status: result.status,
          duration_ms: result.duration_ms,
          error: result.error,
        });
      }

      case "delete_alert_subscription": {
        const id = String(body?.id ?? "");
        if (!id) return json({ error: "id required" }, 400);
        const { data: row } = await sb.from("alert_subscriptions").select("name,kind")
          .eq("id", id).eq("user_id", userId).maybeSingle();
        const { error } = await sb.from("alert_subscriptions").delete()
          .eq("id", id).eq("user_id", userId);
        if (error) return json({ error: error.message }, 400);
        await auditAction(sb, userId, "alert_subscription.deleted", "alert_subscription", id, row ?? {});
        return json({ ok: true });
      }

      // Phase 2 / GDPR — data portability (Article 20). Returns the full
      // user-owned record set as a single JSON archive the operator can
      // download. Sensitive fields (provider_key_encrypted, key_hash) are
      // excluded so this is safe to share with the data subject directly.
      // Recent request_logs are bounded to 10k rows to keep the response
      // size reasonable; older logs are best fetched via the time-bucketed
      // list_logs action with cursors.
      case "export_my_data": {
        const [
          profile, keys, endpoints, sharesGranted, sharesReceived,
          policySettings, policyRules, policyIntents, policyTemplates,
          knownIntents, modelAliases, routes, routeSteps, behaviorProfiles,
          recentLogs, auditLogs,
        ] = await Promise.all([
          sb.from("profiles").select("clerk_user_id,email,created_at").eq("clerk_user_id", userId).maybeSingle(),
          sb.from("api_keys").select("id,name,key_prefix,provider,is_active,is_admin,model_default,compression_mode,endpoint_id,last_used_at,created_at").eq("user_id", userId),
          sb.from("endpoints").select("id,name,base_url,kind,auth_scheme,custom_kind,default_model,model_suggestions,created_at").eq("user_id", userId),
          sb.from("endpoint_shares").select("id,endpoint_id,shared_with_email,shared_with_user_id,permission,created_at").eq("owner_user_id", userId),
          sb.from("endpoint_shares").select("id,endpoint_id,owner_user_id,permission,created_at").eq("shared_with_user_id", userId),
          sb.from("policy_settings").select("*").eq("user_id", userId).maybeSingle(),
          sb.from("policy_rules").select("id,name,kind,severity,direction,enabled,config,applies_to_intents,created_at").eq("user_id", userId),
          sb.from("policy_intents").select("id,intent,action,min_confidence,created_at").eq("user_id", userId),
          sb.from("policy_templates").select("id,name,description,current_version,created_at").eq("user_id", userId),
          sb.from("known_intents").select("id,name,created_at").eq("user_id", userId),
          sb.from("model_aliases").select("id,api_key_id,alias,target_model,target_endpoint_id,created_at").eq("user_id", userId),
          sb.from("routes").select("id,name,fallback_on_5xx,fallback_on_429,fallback_on_timeout,timeout_ms,created_at").eq("user_id", userId),
          sb.from("route_steps").select("id,route_id,position,endpoint_id,model,created_at").eq("user_id", userId),
          sb.from("key_behavior_profiles").select("*").eq("user_id", userId),
          sb.from("request_logs")
            .select("id,api_key_id,model,status,verdict,verdict_layers,block_reason,messages,response,latency_ms,tokens_in,tokens_out,tokens_saved_estimate,compression_applied,created_at")
            .eq("user_id", userId).order("created_at", { ascending: false }).limit(10_000),
          sb.from("audit_logs")
            .select("id,action,target_type,target_id,metadata,created_at")
            .eq("user_id", userId).order("created_at", { ascending: false }).limit(10_000),
        ]);

        // Audit the export itself for compliance.
        await auditAction(sb, userId, "data.exported", "user", userId, {
          counts: {
            api_keys: keys.data?.length ?? 0,
            endpoints: endpoints.data?.length ?? 0,
            endpoint_shares: (sharesGranted.data?.length ?? 0) + (sharesReceived.data?.length ?? 0),
            policy_rules: policyRules.data?.length ?? 0,
            request_logs: recentLogs.data?.length ?? 0,
            audit_logs: auditLogs.data?.length ?? 0,
          },
        });

        return json({
          export_format: "anveguard.v1",
          exported_at: new Date().toISOString(),
          user_id: userId,
          notes: [
            "Sensitive fields excluded by design: api_keys.key_hash, api_keys.provider_key_encrypted, endpoints.provider_key_encrypted.",
            "request_logs and audit_logs are capped at 10,000 most-recent rows. Use list_logs with cursor for older history.",
            "This export is GDPR Article 20 (data portability) compliant.",
          ],
          data: {
            profile: profile.data,
            api_keys: keys.data ?? [],
            endpoints: endpoints.data ?? [],
            endpoint_shares_granted: sharesGranted.data ?? [],
            endpoint_shares_received: sharesReceived.data ?? [],
            policy_settings: policySettings.data,
            policy_rules: policyRules.data ?? [],
            policy_intents: policyIntents.data ?? [],
            policy_templates: policyTemplates.data ?? [],
            known_intents: knownIntents.data ?? [],
            model_aliases: modelAliases.data ?? [],
            routes: routes.data ?? [],
            route_steps: routeSteps.data ?? [],
            key_behavior_profiles: behaviorProfiles.data ?? [],
            request_logs: recentLogs.data ?? [],
            audit_logs: auditLogs.data ?? [],
          },
        });
      }

      // GDPR / M5 — workspace log retention. Lets the operator set per-
      // workspace retention windows for request_logs and audit_logs, plus
      // trigger an immediate prune. The actual pruning runs via the
      // SECURITY DEFINER prune_user_logs RPC (migration: log_retention).
      // pg_cron handles the nightly automatic pass; this action exists so
      // operators can configure + test on demand from the UI.
      case "update_log_retention": {
        const logDays = body?.log_retention_days !== undefined ? Number(body.log_retention_days) : null;
        const auditDays = body?.audit_log_retention_days !== undefined ? Number(body.audit_log_retention_days) : null;
        if (logDays !== null && (!Number.isInteger(logDays) || logDays < 1 || logDays > 3650)) {
          return json({ error: "log_retention_days must be an integer 1-3650" }, 400);
        }
        if (auditDays !== null && (!Number.isInteger(auditDays) || auditDays < 30 || auditDays > 3650)) {
          return json({ error: "audit_log_retention_days must be an integer 30-3650" }, 400);
        }
        const patch: Record<string, unknown> = { user_id: userId };
        if (logDays !== null) patch.log_retention_days = logDays;
        if (auditDays !== null) patch.audit_log_retention_days = auditDays;
        if (Object.keys(patch).length === 1) {
          return json({ error: "no retention fields provided" }, 400);
        }
        const { error } = await sb.from("policy_settings").upsert(patch, { onConflict: "user_id" });
        if (error) return json({ error: error.message }, 400);
        await auditAction(sb, userId, "data.retention_updated", "policy_settings", userId, {
          log_retention_days: logDays,
          audit_log_retention_days: auditDays,
        });
        return json({ ok: true, log_retention_days: logDays, audit_log_retention_days: auditDays });
      }

      case "prune_old_logs": {
        // Manual trigger — prunes this workspace's logs immediately using
        // the configured retention. Audit-logged so accidental clicks are
        // visible. The nightly pg_cron pass calls prune_all_logs() which
        // covers every workspace.
        const { data, error } = await sb.rpc("prune_user_logs", { _user_id: userId });
        if (error) return json({ error: error.message }, 400);
        const result = Array.isArray(data) ? data[0] : data;
        await auditAction(sb, userId, "data.logs_pruned", "user", userId, {
          request_logs_deleted: result?.request_logs_deleted ?? 0,
          audit_logs_deleted: result?.audit_logs_deleted ?? 0,
          triggered: "manual",
        });
        return json({
          ok: true,
          request_logs_deleted: result?.request_logs_deleted ?? 0,
          audit_logs_deleted: result?.audit_logs_deleted ?? 0,
        });
      }

      // GDPR Article 17 — right to erasure. This action only RECORDS the
      // request and writes an immutable audit_logs entry; actual deletion
      // is operator-driven (via Supabase admin tools) so accidental clicks
      // can be reversed within the 30-day grace window. The dashboard UI
      // should show "deletion requested, contact support" after this fires.
      case "request_account_deletion": {
        const reason = String(body?.reason ?? "").slice(0, 500);
        await auditAction(sb, userId, "data.deletion_requested", "user", userId, {
          reason,
          requested_at: new Date().toISOString(),
          note: "Operator must confirm and execute deletion within 30 days per GDPR.",
        });
        return json({
          ok: true,
          message: "Deletion request recorded. Our team will contact you within 7 business days to confirm. Per GDPR Article 17, deletion will complete within 30 days unless we have a documented legal basis to retain specific records.",
        });
      }

      case "list_audit_logs": {
        const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 500);
        const action = url.searchParams.get("action");
        let q = sb.from("audit_logs")
          .select("id,action,target_type,target_id,actor_user_id,metadata,created_at")
          .eq("user_id", userId).order("created_at", { ascending: false }).limit(limit);
        if (action && action !== "all") q = q.eq("action", action);
        const { data, error } = await q;
        if (error) return json({ error: error.message }, 400);
        return json({ entries: data ?? [] });
      }

      // Phase 4 — attack-focused overview for the new /dashboard/threats page.
      // Aggregates the last N hours of request_logs into KPIs the security
      // operator cares about: block/flag counts, top block reasons, layer
      // breakdown, hourly time-series. No new tables; pure SQL → JS reduce.
      // Optional `?range=24h|7d|30d` query param (defaults 24h).
      case "attack_overview": {
        const rangeParam = (url.searchParams.get("range") ?? "24h").toLowerCase();
        const RANGE_HOURS: Record<string, number> = { "24h": 24, "7d": 168, "30d": 720 };
        const hours = RANGE_HOURS[rangeParam] ?? 24;
        const since = new Date(Date.now() - hours * 3600_000).toISOString();
        const { data: logs } = await sb.from("request_logs")
          .select("id,status,verdict,verdict_layers,block_reason,created_at,model,api_key_id")
          .eq("user_id", userId).gte("created_at", since)
          .order("created_at", { ascending: true });

        const total = logs?.length ?? 0;
        const blocked = (logs ?? []).filter((l) => String(l.status ?? "").startsWith("blocked")).length;
        const flagged = (logs ?? []).filter((l) => l.verdict === "flag" && !String(l.status ?? "").startsWith("blocked")).length;
        const allowed = Math.max(0, total - blocked - flagged);
        const block_rate_pct = total > 0 ? Math.round((blocked / total) * 1000) / 10 : 0;

        // Top block reasons — bucketed on `block_reason` text.
        const reasonCounts = new Map<string, number>();
        for (const l of logs ?? []) {
          if (!String(l.status ?? "").startsWith("blocked")) continue;
          const r = (l.block_reason ?? "unknown").toString().slice(0, 200);
          reasonCounts.set(r, (reasonCounts.get(r) ?? 0) + 1);
        }
        const top_block_reasons = Array.from(reasonCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([reason, count]) => ({ reason, count }));

        // Layer breakdown — which detector layer produced each verdict.
        // Each verdict_layers entry has shape {layer, verdict, ...}.
        const layerStats = new Map<string, { blocks: number; flags: number }>();
        for (const l of logs ?? []) {
          for (const lv of (l.verdict_layers ?? []) as { layer?: string; verdict?: string }[]) {
            if (!lv?.layer) continue;
            const cur = layerStats.get(lv.layer) ?? { blocks: 0, flags: 0 };
            if (lv.verdict === "block") cur.blocks += 1;
            else if (lv.verdict === "flag") cur.flags += 1;
            layerStats.set(lv.layer, cur);
          }
        }
        const layer_breakdown = Array.from(layerStats.entries())
          .map(([layer, s]) => ({ layer, blocks: s.blocks, flags: s.flags }))
          .sort((a, b) => (b.blocks + b.flags) - (a.blocks + a.flags));

        // Hourly time-series. Bucket key is ISO hour ("2026-05-04T07:00:00Z").
        const buckets = new Map<string, { hour: string; total: number; blocked: number; flagged: number }>();
        for (let i = hours - 1; i >= 0; i--) {
          const h = new Date(Date.now() - i * 3600_000);
          h.setMinutes(0, 0, 0);
          const k = h.toISOString();
          buckets.set(k, { hour: k, total: 0, blocked: 0, flagged: 0 });
        }
        for (const l of logs ?? []) {
          const t = new Date(l.created_at as string);
          t.setMinutes(0, 0, 0);
          const k = t.toISOString();
          const b = buckets.get(k);
          if (!b) continue;
          b.total += 1;
          if (String(l.status ?? "").startsWith("blocked")) b.blocked += 1;
          else if (l.verdict === "flag") b.flagged += 1;
        }
        const hourly = Array.from(buckets.values());

        return json({
          range: rangeParam,
          range_hours: hours,
          total_requests: total,
          allowed_count: allowed,
          blocked_count: blocked,
          flagged_count: flagged,
          block_rate_pct,
          top_block_reasons,
          layer_breakdown,
          hourly,
        });
      }

      case "stats": {
        const rangeParam = (url.searchParams.get("range") ?? "14d").toLowerCase();
        const RANGE_DAYS: Record<string, number> = { "7d": 7, "14d": 14, "30d": 30, "90d": 90 };
        const days = RANGE_DAYS[rangeParam] ?? 14;
        const since = new Date(Date.now() - days * 86400000).toISOString();
        const { data: logs } = await sb.from("request_logs")
          .select("id,status,latency_ms,created_at,verdict_layers,block_reason,model,api_key_id,messages,tokens_in,tokens_out,tokens_saved_estimate,compression_applied").eq("user_id", userId).gte("created_at", since);
        const { data: keys } = await sb.from("api_keys")
          .select("id,name,key_prefix,is_active,compression_mode").eq("user_id", userId);
        const { data: settingsRow } = await sb.from("policy_settings")
          .select("enable_compression,compression_level").eq("user_id", userId).maybeSingle();
        const wsEnabled = !!settingsRow?.enable_compression;
        const wsLevel = (settingsRow?.compression_level ?? "balanced") as
          "light" | "balanced" | "aggressive";
        const keyMap = new Map((keys ?? []).map((k: any) => [k.id, k]));
        const total = logs?.length ?? 0;
        const blocked = (logs ?? []).filter((l) => l.status?.startsWith("blocked")).length;
        const errors = (logs ?? []).filter((l) => l.status === "error").length;
        const avgLatency = total ? Math.round((logs!.reduce((s, l) => s + (l.latency_ms ?? 0), 0)) / total) : 0;
        const tokensInTotal = (logs ?? []).reduce((s, l) => s + (l.tokens_in ?? 0), 0);
        const tokensOutTotal = (logs ?? []).reduce((s, l) => s + (l.tokens_out ?? 0), 0);
        const tokensSavedTotal = (logs ?? []).reduce((s, l) => s + (l.tokens_saved_estimate ?? 0), 0);
        const compressedRequests = (logs ?? []).filter((l) => l.compression_applied).length;

        // Compression impact breakdown — group by the key's *current* mode
        // (resolves `inherit` against workspace defaults). This evaluates the
        // effectiveness of the active policy; historical mode-at-time is not
        // stored on request_logs.
        const MODES = ["off", "light", "balanced", "aggressive", "inherit"] as const;
        type Mode = typeof MODES[number];
        const breakdown: Record<Mode, {
          mode: Mode; effective: string;
          requests: number; compressed_requests: number;
          tokens_in: number; tokens_out: number; tokens_saved: number;
        }> = Object.fromEntries(MODES.map((m) => [m, {
          mode: m,
          effective: m === "inherit" ? (wsEnabled ? wsLevel : "off") : m,
          requests: 0, compressed_requests: 0,
          tokens_in: 0, tokens_out: 0, tokens_saved: 0,
        }])) as any;
        for (const l of (logs ?? []) as any[]) {
          const k = l.api_key_id ? keyMap.get(l.api_key_id) as any : null;
          const mode = (k?.compression_mode ?? "inherit") as Mode;
          const b = breakdown[mode] ?? breakdown.inherit;
          b.requests += 1;
          if (l.compression_applied) b.compressed_requests += 1;
          b.tokens_in += l.tokens_in ?? 0;
          b.tokens_out += l.tokens_out ?? 0;
          b.tokens_saved += l.tokens_saved_estimate ?? 0;
        }
        const compression_breakdown = MODES
          .map((m) => breakdown[m])
          .filter((b) => b.requests > 0)
          .sort((a, b) => b.tokens_saved - a.tokens_saved);

        // Top triggered rules across the window. We aggregate fired layers
        // (verdict !== "allow") from request_logs.verdict_layers JSONB, keyed
        // by `${layer}:${rule || intent || "—"}` so two regex rules with the
        // same name don't collide with a heuristic detector.
        const ruleCounts = new Map<string, {
          key: string; layer: string; rule: string; verdict: string;
          count: number; blocks: number; last_at: string | null;
        }>();
        // Common matched snippets across blocks — what literally tripped
        // the policy. Lowercased + trimmed so case/whitespace dupes merge.
        const patternCounts = new Map<string, {
          pattern: string; layer: string; rule: string | null;
          count: number; last_at: string | null;
        }>();
        for (const l of (logs ?? []) as any[]) {
          const layers = Array.isArray(l.verdict_layers) ? l.verdict_layers : [];
          for (const lay of layers) {
            const v = String(lay?.verdict ?? "allow");
            if (v === "allow") continue;
            const layer = String(lay?.layer ?? "unknown");
            const rule = String(lay?.rule ?? lay?.intent ?? "—");
            const k = `${layer}::${rule}`;
            let r = ruleCounts.get(k);
            if (!r) {
              r = { key: k, layer, rule, verdict: v, count: 0, blocks: 0, last_at: null };
              ruleCounts.set(k, r);
            }
            r.count += 1;
            if (v === "block") r.blocks += 1;
            if (!r.last_at || (l.created_at && l.created_at > r.last_at)) r.last_at = l.created_at;

            const matchedRaw = lay?.matched ?? lay?.snippet ?? lay?.keyword ?? null;
            if (matchedRaw && typeof matchedRaw === "string") {
              const norm = matchedRaw.trim().toLowerCase().slice(0, 80);
              if (norm.length >= 2) {
                const pk = `${layer}::${norm}`;
                let p = patternCounts.get(pk);
                if (!p) {
                  p = { pattern: matchedRaw.trim().slice(0, 80), layer, rule: lay?.rule ?? lay?.intent ?? null, count: 0, last_at: null };
                  patternCounts.set(pk, p);
                }
                p.count += 1;
                if (!p.last_at || (l.created_at && l.created_at > p.last_at)) p.last_at = l.created_at;
              }
            }
          }
        }
        const top_rules = Array.from(ruleCounts.values())
          .sort((a, b) => b.count - a.count).slice(0, 8);
        const block_patterns = Array.from(patternCounts.values())
          .sort((a, b) => b.count - a.count).slice(0, 8);

        // Most recent blocked requests with the reason metadata pre-extracted
        // so the dashboard can render them without re-parsing verdict_layers.
        const recent_blocks = ((logs ?? []) as any[])
          .filter((l) => typeof l.status === "string" && l.status.startsWith("blocked"))
          .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
          .slice(0, 6)
          .map((l) => {
            const layers = Array.isArray(l.verdict_layers) ? l.verdict_layers : [];
            const fired = layers.find((x: any) => x?.verdict === "block")
              ?? layers.find((x: any) => x?.verdict === "sanitize")
              ?? layers.find((x: any) => x?.verdict === "flag")
              ?? null;
            const lastMsg = Array.isArray(l.messages) && l.messages.length
              ? String(l.messages[l.messages.length - 1]?.content ?? "")
              : "";
            const k = l.api_key_id ? keyMap.get(l.api_key_id) as any : null;
            return {
              id: l.id,
              created_at: l.created_at,
              status: l.status,
              model: l.model,
              api_key_id: l.api_key_id,
              api_key_name: k?.name ?? null,
              api_key_prefix: k?.key_prefix ?? null,
              reason: l.block_reason ?? fired?.reason ?? "Blocked by policy",
              rule: fired?.rule ?? fired?.intent ?? null,
              layer: fired?.layer ?? null,
              matched: fired?.matched ?? fired?.snippet ?? fired?.keyword ?? null,
              prompt_preview: lastMsg.slice(0, 160),
            };
          });

        // Bucket by day
        const buckets: Record<string, { requests: number; blocked: number; tokens_in: number; tokens_out: number; tokens_saved: number }> = {};
        for (let i = days - 1; i >= 0; i--) {
          const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
          buckets[d] = { requests: 0, blocked: 0, tokens_in: 0, tokens_out: 0, tokens_saved: 0 };
        }
        for (const l of logs ?? []) {
          const d = l.created_at.slice(0, 10);
          if (buckets[d]) {
            buckets[d].requests++;
            if (l.status?.startsWith("blocked")) buckets[d].blocked++;
            buckets[d].tokens_in += l.tokens_in ?? 0;
            buckets[d].tokens_out += l.tokens_out ?? 0;
            buckets[d].tokens_saved += l.tokens_saved_estimate ?? 0;
          }
        }
        const chart = Object.entries(buckets).map(([day, v]) => ({ day, ...v }));
        return json({
          range: rangeParam in RANGE_DAYS ? rangeParam : "14d",
          range_days: days,
          total, blocked, errors, avg_latency_ms: avgLatency,
          blocked_pct: total ? Number(((blocked / total) * 100).toFixed(2)) : 0,
          active_keys: (keys ?? []).filter((k) => k.is_active).length,
          total_keys: keys?.length ?? 0,
          tokens_in_total: tokensInTotal,
          tokens_out_total: tokensOutTotal,
          tokens_saved_total: tokensSavedTotal,
          compressed_requests: compressedRequests,
          compression_breakdown,
          chart, top_rules, block_patterns, recent_blocks,
        });
      }

      case "endpoint_usage": {
        // Returns, per custom endpoint owned by the user:
        //   - the API keys bound to it (id, name, prefix, active, last_used_at, created_at)
        //   - recent request_logs whose api_key_id resolves to one of those keys
        //   - aggregate counts (total requests, blocked, avg latency, last_request_at)
        // Optional `endpoint_id` filters to a single endpoint; otherwise returns all.
        // Optional `range` restricts both the recent list AND the aggregate
        // stats to a rolling window: "1h" | "24h" | "7d" | "30d" | "90d" | "all".
        const filterId = url.searchParams.get("endpoint_id") || body.endpoint_id || null;
        const limit = Math.min(Number(url.searchParams.get("limit") ?? body.limit ?? 25), 200);
        const rangeRaw = (url.searchParams.get("range") || body.range || "24h").toString();
        const RANGE_MS: Record<string, number | null> = {
          "1h": 60 * 60 * 1000,
          "24h": 24 * 60 * 60 * 1000,
          "7d": 7 * 24 * 60 * 60 * 1000,
          "30d": 30 * 24 * 60 * 60 * 1000,
          "90d": 90 * 24 * 60 * 60 * 1000,
          "all": null,
        };
        const range = rangeRaw in RANGE_MS ? rangeRaw : "24h";
        const rangeMs = RANGE_MS[range];
        const sinceIso = rangeMs == null ? null : new Date(Date.now() - rangeMs).toISOString();

        let epQ = sb.from("endpoints")
          .select("id,name,base_url,kind,response_format,default_model,created_at")
          .eq("user_id", userId).order("created_at", { ascending: false });
        if (filterId) epQ = epQ.eq("id", filterId);
        const { data: endpoints, error: epErr } = await epQ;
        if (epErr) return json({ error: epErr.message }, 400);
        if (!endpoints || endpoints.length === 0) {
          return json({ usage: [], range, since: sinceIso });
        }

        const epIds = endpoints.map((e: any) => e.id);

        // All API keys for this user that are bound to one of these endpoints.
        const { data: keys } = await sb.from("api_keys")
          .select("id,name,key_prefix,endpoint_id,is_active,last_used_at,created_at,model_default,custom_kind")
          .eq("user_id", userId).in("endpoint_id", epIds);

        const keysByEndpoint = new Map<string, any[]>();
        const keyIdToEndpoint = new Map<string, string>();
        const allKeyIds: string[] = [];
        for (const k of keys ?? []) {
          if (!k.endpoint_id) continue;
          if (!keysByEndpoint.has(k.endpoint_id)) keysByEndpoint.set(k.endpoint_id, []);
          keysByEndpoint.get(k.endpoint_id)!.push(k);
          keyIdToEndpoint.set(k.id, k.endpoint_id);
          allKeyIds.push(k.id);
        }

        // Recent logs for those keys, optionally restricted to the rolling
        // window. Pull a generous batch then bucket per endpoint. Cap at
        // ~1000 rows total to stay within Supabase row defaults.
        const fetchCap = Math.min(1000, Math.max(limit * Math.max(epIds.length, 1) * 4, 100));
        let logs: any[] = [];
        if (allKeyIds.length > 0) {
          let logsQ = sb.from("request_logs")
            .select("id,api_key_id,provider,model,status,block_reason,latency_ms,tokens_in,tokens_out,created_at")
            .eq("user_id", userId).in("api_key_id", allKeyIds)
            .order("created_at", { ascending: false })
            .limit(fetchCap);
          if (sinceIso) logsQ = logsQ.gte("created_at", sinceIso);
          const { data: rows } = await logsQ;
          logs = rows ?? [];
        }

        const keyNameById = new Map((keys ?? []).map((k: any) => [k.id, k.name]));
        const usage = endpoints.map((ep: any) => {
          const epKeys = keysByEndpoint.get(ep.id) ?? [];
          const epKeyIds = new Set(epKeys.map((k: any) => k.id));
          const epLogs = logs.filter((l) => l.api_key_id && epKeyIds.has(l.api_key_id));
          const total = epLogs.length;
          const blocked = epLogs.filter((l) => typeof l.status === "string" && l.status.startsWith("blocked")).length;
          const errored = epLogs.filter((l) => l.status === "error").length;
          const sumLatency = epLogs.reduce((s, l) => s + (l.latency_ms ?? 0), 0);
          const avg_latency_ms = total ? Math.round(sumLatency / total) : 0;
          const last_request_at = epLogs[0]?.created_at ?? null;
          const recent = epLogs.slice(0, limit).map((l) => ({
            ...l, api_key_name: keyNameById.get(l.api_key_id) ?? "—",
          }));

          // Per-model breakdown over the same windowed log set. Grouped by
          // `model` (rows missing a model id are bucketed as "(unknown)"),
          // sorted by request count desc, capped at 8 entries.
          const modelBuckets = new Map<string, {
            model: string;
            request_count: number;
            blocked_count: number;
            error_count: number;
            latency_sum: number;
            latency_n: number;
            tokens_in_total: number;
            tokens_out_total: number;
            last_request_at: string | null;
          }>();
          for (const l of epLogs) {
            const key = (typeof l.model === "string" && l.model.trim()) ? l.model : "(unknown)";
            let b = modelBuckets.get(key);
            if (!b) {
              b = {
                model: key, request_count: 0, blocked_count: 0, error_count: 0,
                latency_sum: 0, latency_n: 0, tokens_in_total: 0, tokens_out_total: 0,
                last_request_at: null,
              };
              modelBuckets.set(key, b);
            }
            b.request_count += 1;
            if (typeof l.status === "string" && l.status.startsWith("blocked")) b.blocked_count += 1;
            if (l.status === "error") b.error_count += 1;
            if (typeof l.latency_ms === "number") {
              b.latency_sum += l.latency_ms;
              b.latency_n += 1;
            }
            if (typeof l.tokens_in === "number") b.tokens_in_total += l.tokens_in;
            if (typeof l.tokens_out === "number") b.tokens_out_total += l.tokens_out;
            if (!b.last_request_at || (l.created_at && l.created_at > b.last_request_at)) {
              b.last_request_at = l.created_at ?? b.last_request_at;
            }
          }
          const top_models = Array.from(modelBuckets.values())
            .map((b) => ({
              model: b.model,
              request_count: b.request_count,
              blocked_count: b.blocked_count,
              error_count: b.error_count,
              avg_latency_ms: b.latency_n ? Math.round(b.latency_sum / b.latency_n) : 0,
              tokens_in_total: b.tokens_in_total,
              tokens_out_total: b.tokens_out_total,
              last_request_at: b.last_request_at,
            }))
            .sort((a, b) => b.request_count - a.request_count)
            .slice(0, 8);

          return {
            endpoint: ep,
            keys: epKeys.map((k: any) => ({
              id: k.id, name: k.name, key_prefix: k.key_prefix,
              is_active: k.is_active, last_used_at: k.last_used_at,
              created_at: k.created_at, model_default: k.model_default,
              custom_kind: k.custom_kind,
            })),
            stats: {
              key_count: epKeys.length,
              active_key_count: epKeys.filter((k: any) => k.is_active).length,
              request_count: total,
              blocked_count: blocked,
              error_count: errored,
              avg_latency_ms,
              last_request_at,
            },
            recent_requests: recent,
            top_models,
          };
        });

        return json({ usage, range, since: sinceIso });
      }

      case "endpoint_request_detail": {
        // Returns the full row for a single request_log, including the prompt
        // (`messages`) and `response` jsonb payloads. Owner-only: we double-
        // check that the log row belongs to the calling user, AND that the
        // associated api_key (if any) is bound to an endpoint the user owns.
        // Shared-with-me recipients are NOT granted log access here.
        const requestId = url.searchParams.get("request_id") || body.request_id;
        if (!requestId || typeof requestId !== "string") {
          return json({ error: "request_id required" }, 400);
        }
        const { data: log, error: logErr } = await sb
          .from("request_logs")
          .select("*")
          .eq("id", requestId)
          .eq("user_id", userId)
          .maybeSingle();
        if (logErr) return json({ error: logErr.message }, 400);
        if (!log) return json({ error: "Request not found" }, 404);

        // Extra ownership check via the api_key -> endpoint chain.
        if (log.api_key_id) {
          const { data: key } = await sb
            .from("api_keys")
            .select("id,endpoint_id,name,key_prefix")
            .eq("id", log.api_key_id)
            .eq("user_id", userId)
            .maybeSingle();
          if (key?.endpoint_id) {
            const { data: ep } = await sb
              .from("endpoints")
              .select("id")
              .eq("id", key.endpoint_id)
              .eq("user_id", userId)
              .maybeSingle();
            if (!ep) return json({ error: "Request not found" }, 404);
          }
          (log as any).api_key_name = key?.name ?? null;
          (log as any).api_key_prefix = key?.key_prefix ?? null;
        }

        return json({ request: log });
      }

      case "set_endpoint_default_model": {
        // Persist `default_model` for a saved endpoint, but ONLY after re-validating
        // that the chosen model is actually present in a fresh upstream `/models`
        // listing. This guarantees we never silently save a model id that the
        // provider doesn't recognize. The caller may pass `force: true` to skip
        // upstream re-validation (used when the user explicitly opts in despite
        // the model not appearing in the live list).
        const { id, default_model, force } = body;
        if (!id || typeof id !== "string") return json({ error: "id required" }, 400);
        if (typeof default_model !== "string" || !default_model.trim()) {
          return json({ error: "default_model required" }, 400);
        }
        const chosen = default_model.trim().slice(0, 200);

        const { data: row } = await sb.from("endpoints").select("*")
          .eq("id", id).eq("user_id", userId).maybeSingle();
        if (!row) return json({ error: "Endpoint not found" }, 404);

        if (!force) {
          // Re-fetch the upstream models list and verify the chosen id is there.
          let resolved;
          try {
            resolved = resolveCustomEndpoint({
              base_url: row.base_url, models_url: row.models_url || null,
              kind: row.kind, auth_scheme: row.auth_scheme,
              auth_header: row.auth_header || null,
              extra_headers: row.extra_headers || null,
              path_prefix: row.path_prefix || null,
              chat_path: row.chat_path || null,
              models_path: row.models_path || null,
              response_format: row.response_format || null,
            });
          } catch (e) {
            return json({ error: e instanceof Error ? e.message : String(e) }, 400);
          }

          const headers: Record<string, string> = { Accept: "application/json", ...resolved.extra_headers };
          let listUrl = resolved.models_url;
          const upstreamKey = row.provider_key_encrypted
            ? await decryptString(row.provider_key_encrypted) : null;
          if (upstreamKey && resolved.auth_scheme !== "none") {
            if (resolved.auth_scheme === "bearer") headers["Authorization"] = `Bearer ${upstreamKey}`;
            else if (resolved.auth_scheme === "x-api-key") headers["x-api-key"] = upstreamKey;
            else if (resolved.auth_scheme === "header") headers[resolved.auth_header] = upstreamKey;
            else if (resolved.auth_scheme === "query") {
              const u = new URL(listUrl);
              u.searchParams.set(resolved.auth_header, upstreamKey);
              listUrl = u.toString();
            }
          }
          if (resolved.kind === "anthropic" && !headers["anthropic-version"]) {
            headers["anthropic-version"] = "2023-06-01";
          }

          let resp: Response;
          try {
            resp = await fetch(listUrl, { headers });
          } catch (e) {
            return json({
              error: `Could not reach upstream to verify the model: ${e instanceof Error ? e.message : String(e)}`,
              code: "upstream_unreachable",
            }, 502);
          }
          const text = await resp.text();
          if (!resp.ok) {
            return json({
              error: `Upstream rejected the models request (HTTP ${resp.status}). ${text.slice(0, 200)}`,
              code: "upstream_error", status: resp.status,
            }, 502);
          }
          let parsed;
          try {
            const j = JSON.parse(text);
            const hint = resolved.kind === "anthropic" ? "anthropic"
              : (resolved.kind === "ollama" ? "ollama" : null);
            parsed = parseModelsResponse(j, hint);
          } catch {
            return json({
              error: "Upstream did not return JSON for /models — cannot verify the model.",
              code: "parse_failed",
            }, 502);
          }
          if (parsed.ids.length === 0) {
            return json({
              error: "Upstream returned 0 models — cannot verify the model.",
              code: "empty_list",
            }, 502);
          }
          if (!parsed.ids.includes(chosen)) {
            return json({
              error: `Model "${chosen}" was not found in the upstream list (${parsed.ids.length} models). Refresh the list or pass force=true to save anyway.`,
              code: "model_missing",
              available: parsed.ids.slice(0, 10),
            }, 400);
          }
        }

        const { error: upErr } = await sb.from("endpoints")
          .update({ default_model: chosen }).eq("id", id).eq("user_id", userId);
        if (upErr) return json({ error: upErr.message }, 400);
        await auditAction(sb, userId, "endpoint.default_model_set", "endpoint", id, {
          default_model: chosen, forced: !!force,
        });
        return json({ ok: true, default_model: chosen, forced: !!force });
      }

      case "export_endpoints": {
        // Returns the user's endpoint configurations as a portable JSON document.
        // Provider keys are NEVER included in plain form. By default they are stripped
        // (`include_keys: "none"`). When `include_keys: "encrypted"` is requested we
        // emit the at-rest ciphertext (only restorable on this same project, since the
        // encryption secret stays server-side). We never return decrypted keys.
        const includeKeys = (body.include_keys === "encrypted") ? "encrypted" : "none";
        const idsFilter: string[] | null = Array.isArray(body.ids) && body.ids.length > 0
          ? body.ids.filter((x: unknown) => typeof x === "string")
          : null;

        let q = sb.from("endpoints")
          .select("id,name,base_url,models_url,kind,auth_scheme,auth_header,extra_headers,model_suggestions,default_model,path_prefix,chat_path,models_path,response_format,provider_key_encrypted,created_at,updated_at")
          .eq("user_id", userId).order("created_at", { ascending: true });
        if (idsFilter) q = q.in("id", idsFilter);
        const { data, error } = await q;
        if (error) return json({ error: error.message }, 400);

        const endpoints = (data ?? []).map((e: any) => {
          const base = {
            name: e.name,
            base_url: e.base_url,
            models_url: e.models_url,
            kind: e.kind,
            auth_scheme: e.auth_scheme,
            auth_header: e.auth_header,
            extra_headers: e.extra_headers ?? {},
            model_suggestions: e.model_suggestions ?? [],
            default_model: e.default_model,
            path_prefix: e.path_prefix,
            chat_path: e.chat_path,
            models_path: e.models_path,
            response_format: e.response_format,
            has_key: !!e.provider_key_encrypted,
          };
          if (includeKeys === "encrypted" && e.provider_key_encrypted) {
            return { ...base, provider_key_encrypted: e.provider_key_encrypted };
          }
          return base;
        });

        return json({
          format: "anveguard.endpoints",
          version: 1,
          exported_at: new Date().toISOString(),
          include_keys: includeKeys,
          count: endpoints.length,
          endpoints,
        });
      }

      case "import_endpoints": {
        // Restore endpoints from a previously-exported JSON document.
        // - Strategy: "skip" (default) keeps existing endpoints with the same name
        //             "rename" appends " (imported)" if name collides
        //             "overwrite" updates the existing same-name endpoint in place
        // - Provider keys: imported only when `provider_key_encrypted` is present and
        //   `accept_encrypted_keys: true` (encrypted blobs only restore on the same project).
        //   Plaintext provider keys in payloads are intentionally ignored.
        const payload = body.payload;
        if (!payload || typeof payload !== "object") {
          return json({ error: "Missing import payload" }, 400);
        }
        if (payload.format && payload.format !== "anveguard.endpoints") {
          return json({ error: `Unsupported format: ${payload.format}` }, 400);
        }
        if (payload.version && Number(payload.version) > 1) {
          return json({ error: `Unsupported export version: ${payload.version}` }, 400);
        }
        const items = Array.isArray(payload.endpoints) ? payload.endpoints : [];
        if (items.length === 0) return json({ imported: 0, skipped: 0, updated: 0, errors: [] });

        const strategy = ["skip", "rename", "overwrite"].includes(body.strategy) ? body.strategy : "skip";
        const acceptEncrypted = body.accept_encrypted_keys === true;

        // Existing endpoints for collision checks.
        const { data: existing } = await sb.from("endpoints")
          .select("id,name").eq("user_id", userId);
        const byName = new Map<string, string>();
        for (const e of existing ?? []) byName.set(e.name, e.id);

        const errors: { name?: string; error: string }[] = [];
        let imported = 0, skipped = 0, updated = 0;

        for (const raw of items) {
          if (!raw || typeof raw !== "object") {
            errors.push({ error: "Invalid entry (not an object)" });
            continue;
          }
          const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 120) : "";
          const base_url = typeof raw.base_url === "string" ? raw.base_url.trim() : "";
          if (!name || !base_url) {
            errors.push({ name, error: "Missing name or base_url" });
            continue;
          }

          // Normalize + validate via the same resolver used by save_endpoint.
          let resolved;
          try {
            resolved = resolveCustomEndpoint({
              base_url,
              models_url: raw.models_url || null,
              kind: raw.kind,
              auth_scheme: raw.auth_scheme,
              auth_header: raw.auth_header || null,
              extra_headers: raw.extra_headers || null,
              path_prefix: raw.path_prefix || null,
              chat_path: raw.chat_path || null,
              models_path: raw.models_path || null,
              response_format: raw.response_format || null,
            });
          } catch (e) {
            errors.push({ name, error: e instanceof Error ? e.message : String(e) });
            continue;
          }

          const row: Record<string, unknown> = {
            user_id: userId,
            name,
            base_url,
            models_url: raw.models_url || null,
            kind: resolved.kind,
            auth_scheme: resolved.auth_scheme,
            auth_header: resolved.auth_header,
            extra_headers: sanitizeExtraHeaders(raw.extra_headers || null),
            model_suggestions: Array.isArray(raw.model_suggestions)
              ? raw.model_suggestions
                  .filter((x: unknown) => typeof x === "string" && x.trim())
                  .map((x: string) => String(x).trim())
              : [],
            default_model: raw.default_model ? String(raw.default_model).slice(0, 200) : null,
            path_prefix: raw.path_prefix ? String(raw.path_prefix).slice(0, 200) : null,
            chat_path: raw.chat_path ? String(raw.chat_path).slice(0, 200) : null,
            models_path: raw.models_path ? String(raw.models_path).slice(0, 200) : null,
            response_format: resolved.response_format,
          };

          // Only accept already-encrypted keys, and only when explicitly opted in.
          // Plaintext keys in the payload are ignored on purpose.
          if (acceptEncrypted && typeof raw.provider_key_encrypted === "string" && raw.provider_key_encrypted.length > 0) {
            row.provider_key_encrypted = raw.provider_key_encrypted;
          }

          const collisionId = byName.get(name);
          try {
            if (collisionId) {
              if (strategy === "skip") { skipped++; continue; }
              if (strategy === "overwrite") {
                const { error } = await sb.from("endpoints")
                  .update(row).eq("id", collisionId).eq("user_id", userId);
                if (error) { errors.push({ name, error: error.message }); continue; }
                updated++; continue;
              }
              // rename
              let suffix = 2;
              let candidate = `${name} (imported)`;
              while (byName.has(candidate)) { candidate = `${name} (imported ${suffix++})`; }
              row.name = candidate;
            }
            const { data: ins, error } = await sb.from("endpoints")
              .insert(row).select("id,name").single();
            if (error) { errors.push({ name, error: error.message }); continue; }
            byName.set(ins.name, ins.id);
            imported++;
          } catch (e) {
            errors.push({ name, error: e instanceof Error ? e.message : String(e) });
          }
        }

        await auditAction(sb, userId, "endpoints.imported", "endpoint", null, {
          imported, updated, skipped,
          error_count: errors.length,
          strategy,
          accept_encrypted_keys: acceptEncrypted,
        });
        return json({ imported, updated, skipped, errors });
      }

      // ===================================================================
      // Model aliases (per-API-key nicknames -> upstream model id)
      // ===================================================================
      case "list_aliases": {
        const { api_key_id } = body;
        let q = sb.from("model_aliases").select("*").eq("user_id", userId)
          .order("alias", { ascending: true });
        if (api_key_id) q = q.eq("api_key_id", api_key_id);
        const { data, error } = await q;
        if (error) return json({ error: error.message }, 400);
        return json({ aliases: data ?? [] });
      }

      case "save_alias": {
        const { id, api_key_id, alias, target_model, target_endpoint_id } = body ?? {};
        if (!api_key_id || !alias || !target_model) {
          return json({ error: "api_key_id, alias, and target_model are required" }, 400);
        }
        const aliasNorm = String(alias).trim().toLowerCase();
        if (!/^[a-z0-9][a-z0-9._\-:/]{0,63}$/.test(aliasNorm)) {
          return json({ error: "Alias must be 1–64 chars, lowercase, no spaces" }, 400);
        }
        // Verify ownership of the key
        const { data: key } = await sb.from("api_keys").select("id")
          .eq("id", api_key_id).eq("user_id", userId).maybeSingle();
        if (!key) return json({ error: "API key not found" }, 404);
        // Verify ownership of endpoint if provided
        if (target_endpoint_id) {
          const { data: ep } = await sb.from("endpoints").select("id")
            .eq("id", target_endpoint_id).eq("user_id", userId).maybeSingle();
          if (!ep) return json({ error: "Target endpoint not found" }, 404);
        }
        const row = {
          user_id: userId,
          api_key_id,
          alias: aliasNorm,
          target_model: String(target_model).trim(),
          target_endpoint_id: target_endpoint_id || null,
        };
        if (id) {
          const { error } = await sb.from("model_aliases").update(row)
            .eq("id", id).eq("user_id", userId);
          if (error) return json({ error: error.message }, 400);
          await auditAction(sb, userId, "model_alias.updated", "model_alias", id, { alias: aliasNorm, target_model: row.target_model });
          return json({ ok: true, id });
        }
        const { data, error } = await sb.from("model_aliases").insert(row)
          .select("id").single();
        if (error) return json({ error: error.message }, 400);
        await auditAction(sb, userId, "model_alias.created", "model_alias", data!.id, { alias: aliasNorm, target_model: row.target_model });
        return json({ ok: true, id: data!.id });
      }

      case "delete_alias": {
        const { id } = body ?? {};
        if (!id) return json({ error: "id required" }, 400);
        const { data: row } = await sb.from("model_aliases").select("alias,target_model")
          .eq("id", id).eq("user_id", userId).maybeSingle();
        const { error } = await sb.from("model_aliases").delete()
          .eq("id", id).eq("user_id", userId);
        if (error) return json({ error: error.message }, 400);
        await auditAction(sb, userId, "model_alias.deleted", "model_alias", id, row ?? {});
        return json({ ok: true });
      }

      // ===================================================================
      // Routes (named, ordered fallback chains)
      // ===================================================================
      case "list_routes": {
        const { data: routes, error } = await sb.from("routes")
          .select("*").eq("user_id", userId)
          .order("created_at", { ascending: false });
        if (error) return json({ error: error.message }, 400);
        const ids = (routes ?? []).map((r: any) => r.id);
        const stepsByRoute: Record<string, any[]> = {};
        if (ids.length > 0) {
          const { data: steps } = await sb.from("route_steps")
            .select("*").in("route_id", ids)
            .order("position", { ascending: true });
          for (const s of steps ?? []) {
            (stepsByRoute[s.route_id] ||= []).push(s);
          }
        }
        return json({
          routes: (routes ?? []).map((r: any) => ({ ...r, steps: stepsByRoute[r.id] ?? [] })),
        });
      }

      case "save_route": {
        const {
          id, name, description,
          fallback_on_5xx, fallback_on_429, fallback_on_timeout,
          timeout_ms, steps,
        } = body ?? {};
        if (!name || !String(name).trim()) return json({ error: "Name is required" }, 400);
        const nameNorm = String(name).trim();
        if (!/^[a-zA-Z0-9][a-zA-Z0-9._\- ]{0,63}$/.test(nameNorm)) {
          return json({ error: "Route name must be 1–64 chars (letters, digits, .-_ space)" }, 400);
        }
        if (!Array.isArray(steps) || steps.length === 0) {
          return json({ error: "At least one step is required" }, 400);
        }
        // Validate every endpoint belongs to the user
        const epIds = [...new Set(steps.map((s: any) => String(s.endpoint_id)).filter(Boolean))];
        if (epIds.length === 0) return json({ error: "Each step needs an endpoint" }, 400);
        const { data: owned } = await sb.from("endpoints")
          .select("id").eq("user_id", userId).in("id", epIds);
        const ownedSet = new Set((owned ?? []).map((e: any) => e.id));
        for (const s of steps) {
          if (!s.endpoint_id || !ownedSet.has(String(s.endpoint_id))) {
            return json({ error: "Step endpoint not found or not owned by you" }, 400);
          }
          if (!s.model || !String(s.model).trim()) {
            return json({ error: "Each step needs a model" }, 400);
          }
        }
        const routeRow = {
          user_id: userId,
          name: nameNorm,
          description: description ? String(description).slice(0, 500) : null,
          fallback_on_5xx: !!fallback_on_5xx,
          fallback_on_429: !!fallback_on_429,
          fallback_on_timeout: !!fallback_on_timeout,
          timeout_ms: Math.max(1000, Math.min(120000, Number(timeout_ms) || 30000)),
        };

        let routeId = id as string | undefined;
        if (routeId) {
          const { error } = await sb.from("routes").update(routeRow)
            .eq("id", routeId).eq("user_id", userId);
          if (error) return json({ error: error.message }, 400);
          // Replace steps wholesale (simpler than diffing)
          await sb.from("route_steps").delete().eq("route_id", routeId);
        } else {
          const { data: ins, error } = await sb.from("routes").insert(routeRow)
            .select("id").single();
          if (error) return json({ error: error.message }, 400);
          routeId = ins!.id;
        }
        const stepRows = steps.map((s: any, i: number) => ({
          route_id: routeId,
          position: i,
          endpoint_id: String(s.endpoint_id),
          model: String(s.model).trim(),
        }));
        const { error: stepErr } = await sb.from("route_steps").insert(stepRows);
        if (stepErr) return json({ error: stepErr.message }, 400);
        await auditAction(sb, userId, "route.upserted", "route", routeId, {
          name: nameNorm,
          steps_count: steps.length,
        });
        return json({ ok: true, id: routeId });
      }

      case "delete_route": {
        const { id } = body ?? {};
        if (!id) return json({ error: "id required" }, 400);
        const { data: row } = await sb.from("routes").select("name")
          .eq("id", id).eq("user_id", userId).maybeSingle();
        const { error } = await sb.from("routes").delete()
          .eq("id", id).eq("user_id", userId);
        if (error) return json({ error: error.message }, 400);
        await auditAction(sb, userId, "route.deleted", "route", id, row ?? {});
        return json({ ok: true });
      }

      default:
        return json({ error: "Unknown action" }, 400);
    }
    } catch (e) {
      console.error("dashboard error:", e);
      return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
    }
  })();
  return applyDashboardCors(inner, req);
});

async function safeJson(req: Request): Promise<any> {
  try { return await req.clone().json(); } catch { return {}; }
}
