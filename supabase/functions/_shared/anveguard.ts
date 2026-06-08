// Shared helpers for AnveGuard edge functions.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { createRemoteJWKSet, jwtVerify } from "https://esm.sh/jose@5.9.6";

// Wildcard CORS — used by the public proxy endpoint, which is intended to be
// called from any origin (it's an OpenAI-compatible API).
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-clerk-auth, x-api-key, x-anveguard-key-id",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

// Default origin patterns for the dashboard function. Local dev (any port) and
// Lovable preview/production URLs are always allowed so the included setup
// keeps working out of the box. Add additional production origins via the
// ALLOWED_ORIGINS env var (comma-separated, exact-match strings).
const DEFAULT_DASHBOARD_ORIGIN_PATTERNS: RegExp[] = [
  /^http:\/\/localhost:\d+$/,
  /^http:\/\/127\.0\.0\.1:\d+$/,
  /^https:\/\/[a-z0-9-]+\.lovable\.app$/i,
  /^https:\/\/[a-z0-9-]+\.lovableproject\.com$/i,
  /^https:\/\/[a-z0-9-]+\.lovable\.dev$/i,
  /^https:\/\/(?:[a-z0-9-]+\.)*citerlabs\.com$/i,
];

function isAllowedDashboardOrigin(origin: string): boolean {
  if (DEFAULT_DASHBOARD_ORIGIN_PATTERNS.some((re) => re.test(origin))) return true;
  const env = Deno.env.get("ALLOWED_ORIGINS")?.trim();
  if (!env) return false;
  const allowed = env.split(",").map((o) => o.trim()).filter(Boolean);
  return allowed.includes(origin);
}

/**
 * CORS headers for the dashboard function. Echoes the request's Origin only
 * when it matches the allowlist, never `*` — the dashboard carries Clerk
 * JWTs and must not be readable from arbitrary origins.
 */
export function dashboardCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-clerk-auth",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Vary": "Origin",
  };
  if (origin && isAllowedDashboardOrigin(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

/**
 * Wrap an inner Response so its CORS headers reflect the caller's Origin.
 * Used by the dashboard function to override the wildcard headers `json()`
 * stamps onto its responses.
 */
export function applyDashboardCors(res: Response, req: Request): Response {
  const cors = dashboardCorsHeaders(req);
  const headers = new Headers(res.headers);
  headers.delete("Access-Control-Allow-Origin");
  for (const [k, v] of Object.entries(cors)) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
}

export function json(body: unknown, status = 200, extra: HeadersInit = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extra },
  });
}

export function service() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

// Cache JWKS per-issuer
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

/** Verify a Clerk session JWT and return the user id (sub). */
export async function verifyClerkJwt(token: string): Promise<{ sub: string; email?: string }> {
  // Decode header/payload without verifying to discover the issuer
  const [, payloadB64] = token.split(".");
  if (!payloadB64) throw new Error("Invalid token");
  const payload = JSON.parse(atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/")));
  const issuer: string | undefined = payload.iss;
  if (!issuer || !issuer.startsWith("https://")) throw new Error("Invalid issuer");

  let jwks = jwksCache.get(issuer);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
    jwksCache.set(issuer, jwks);
  }
  const { payload: verified } = await jwtVerify(token, jwks, { issuer });
  return { sub: String(verified.sub), email: (verified as any).email };
}

/** Read Bearer token from Authorization header. */
export function bearer(req: Request): string | null {
  const h = req.headers.get("Authorization") || req.headers.get("authorization");
  if (!h?.startsWith("Bearer ")) return null;
  return h.slice(7).trim();
}

/** Ensure a profile row exists for this Clerk user. */
export async function ensureProfile(userId: string, email?: string) {
  const sb = service();
  await sb.from("profiles").upsert({ clerk_user_id: userId, email: email ?? null }, { onConflict: "clerk_user_id" });
  // Ensure default policies row
  await sb.from("policies").upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true });
  // Back-fill any pending endpoint shares created before this user signed in
  // (matches by lower-cased email and stamps in the resolved Clerk id).
  if (email) {
    try {
      await sb.rpc("claim_endpoint_shares", { _user_id: userId, _email: email });
    } catch {
      // Non-fatal — sharing UI will retry next login.
    }
  }
}

// === Rate limiting ===

/**
 * Best-effort caller-IP extraction. Tries the standard proxy headers in
 * priority order; falls back to "unknown" so a missing header still produces
 * a usable bucket key (a single shared bucket for unknown callers).
 */
export function callerIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const xri = req.headers.get("x-real-ip")?.trim();
  if (xri) return xri;
  const cf = req.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  return "unknown";
}

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  retryAfterSeconds: number;
}

/**
 * Increment a rate-limit bucket and return whether the caller is over the
 * limit. Designed to **fail open**: if the RPC errors (table missing, network
 * blip), we log and allow the request. This means deploying the proxy code
 * before the migration runs is safe — protection turns on as soon as the
 * migration applies.
 */
export async function checkRateLimit(
  sb: ReturnType<typeof service>,
  scope: string,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  try {
    const { data, error } = await sb.rpc("increment_rate_limit", {
      _scope: scope, _key: key, _window_seconds: windowSeconds,
    });
    if (error || !data || !data[0]) {
      if (error) console.error("rate_limit rpc error (failing open):", error.message);
      return { allowed: true, count: 0, retryAfterSeconds: 0 };
    }
    const count = Number(data[0].count) || 0;
    if (count > limit) {
      return { allowed: false, count, retryAfterSeconds: windowSeconds };
    }
    return { allowed: true, count, retryAfterSeconds: 0 };
  } catch (e) {
    console.error("rate_limit threw (failing open):", e instanceof Error ? e.message : e);
    return { allowed: true, count: 0, retryAfterSeconds: 0 };
  }
}

// === API key generation / hashing ===

const enc = new TextEncoder();

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function generateApiKey(): string {
  // 24 bytes = 192 bits of entropy. base64url encoding (RFC 4648 §5) keeps the
  // full 64-char alphabet URL-safe and avoids the collision the previous
  // implementation introduced by collapsing both `+` and `/` to `0`.
  // Existing keys remain valid — verification hashes the raw string, so the
  // alphabet change is backwards compatible.
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const b64url = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
  return `ag_live_${b64url}`;
}

// === AES-GCM encrypt/decrypt for stored OpenAI keys ===

async function getKey(): Promise<CryptoKey> {
  const secret = Deno.env.get("KEY_ENCRYPTION_SECRET");
  if (!secret) throw new Error("KEY_ENCRYPTION_SECRET not set");
  const hash = await crypto.subtle.digest("SHA-256", enc.encode(secret));
  return crypto.subtle.importKey("raw", hash, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptString(plain: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plain)));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0); out.set(ct, iv.length);
  return btoa(String.fromCharCode(...out));
}

export async function decryptString(payload: string): Promise<string> {
  const key = await getKey();
  const bin = Uint8Array.from(atob(payload), (c) => c.charCodeAt(0));
  const iv = bin.slice(0, 12);
  const ct = bin.slice(12);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(pt);
}

// === Policy engine ===

export const GLOBAL_DEFAULT_BLOCKED = [
  // English
  "ignore previous instructions",
  "ignore all previous",
  "system prompt",
  "jailbreak",
  "DAN mode",
  // French — covers "ignorez les instructions précédentes" and variants.
  // checkPolicy normalizes to lowercase before comparing so accents match.
  "ignorez les instructions",
  "oubliez les instructions",
  "ignorer les instructions",
  // Spanish
  "ignora las instrucciones",
  "ignore las instrucciones",
  "olvida las instrucciones",
  // German
  "ignoriere die anweisungen",
  "vergiss die anweisungen",
  // Italian
  "ignora le istruzioni",
  // Portuguese
  "ignore as instruções",
  "ignore todas as instruções",
];

/**
 * Collapse a string into a "fuzzy form" that survives common bypass tricks:
 *   - NFKC normalization (full-width to ASCII)
 *   - lowercase + zero-width strip + smart-quote/dash fold
 *   - leetspeak fold (@->a, 0->o, 1->i, 3->e, 4->a, 5->s, 7->t, $->s, !->i)
 *   - drop non-alphanumerics (handles "j a i l b r e a k", "j.a.i.l", "j-a-i-l")
 * Used for both haystack and needle so comparisons are symmetric.
 */
export function fuzzyForm(s: string): string {
  const ZW = /[\u200B-\u200D\u2060\uFEFF]/g;
  const SMART = /[\u2018\u2019\u201A\u201B\u201C\u201D\u201E\u201F\u2013\u2014\u2212]/g;
  const LEET: Record<string, string> = { "@": "a", "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "$": "s", "!": "i" };
  const folded = s
    .normalize("NFKC")
    .replace(ZW, "")
    .replace(SMART, " ")
    .toLowerCase()
    .split("")
    .map((c) => LEET[c] ?? c)
    .join("");
  return folded.replace(/[^a-z0-9]+/g, "");
}

/**
 * Bounded Damerau-Levenshtein distance — returns Infinity if it would exceed
 * `maxDist`. O(n*m) but with early-exit so it's effectively O(n) for small
 * `maxDist`. We use it for short keywords only (≤ 24 chars).
 */
export function boundedEditDistance(a: string, b: string, maxDist: number): number {
  if (Math.abs(a.length - b.length) > maxDist) return Infinity;
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array(n + 1).fill(0).map((_, i) => i);
  let cur = new Array(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(
        cur[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + cost,
      );
      // transposition
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        cur[j] = Math.min(cur[j], (prev[j - 2] ?? Infinity) + cost);
      }
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > maxDist) return Infinity;
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

export interface KeywordMatchOptions {
  /** When true, also match against the fuzzy-collapsed form (catches spaced /
   *  leet / unicode bypasses). Default true. */
  fuzzy?: boolean;
  /** When true, run a bounded Levenshtein scan against word windows of the
   *  haystack so single-character typos still match. Default true. */
  edit_distance?: boolean;
}

/**
 * Multi-pass blocked-keyword check:
 *   1. Substring match on the lowercased raw text (cheap, original behavior).
 *   2. Substring match on the fuzzy form (collapsed spaces, leet, unicode).
 *   3. Bounded Damerau-Levenshtein over sliding word windows (typo bypass).
 *
 * The allowlist is checked against the *raw* lowercase form only — allowlist
 * exceptions should be exact, otherwise users could neutralize a blocked
 * keyword with a fuzzy-matching allow term, which is a footgun.
 */
export function checkPolicy(
  text: string,
  blocked: string[],
  allowed: string[],
  opts: KeywordMatchOptions = {},
): { blocked: boolean; matched?: string; mode?: "exact" | "fuzzy" | "edit" } {
  const fuzzy = opts.fuzzy !== false;
  const editDistance = opts.edit_distance !== false;

  const lower = text.toLowerCase();
  const allowedHit = allowed.some((a) => {
    const t = a.trim().toLowerCase();
    return t && lower.includes(t);
  });
  const fuzzyText = fuzzy ? fuzzyForm(text) : "";

  // Tokens for edit-distance scanning. We compare against single words AND
  // 2-3 word windows (joined without spaces) so multi-word terms work.
  const words = editDistance ? lower.split(/\W+/).filter(Boolean) : [];
  const windows: string[] = [];
  if (editDistance) {
    for (let i = 0; i < words.length; i++) {
      windows.push(words[i]);
      if (i + 1 < words.length) windows.push(words[i] + words[i + 1]);
      if (i + 2 < words.length) windows.push(words[i] + words[i + 1] + words[i + 2]);
    }
  }

  for (const term of blocked) {
    const t = term.trim().toLowerCase();
    if (!t) continue;

    // 1. Exact substring (cheapest, preserves original behavior).
    if (lower.includes(t)) {
      if (allowedHit) continue;
      return { blocked: true, matched: term, mode: "exact" };
    }

    // 2. Fuzzy form. Skip very short terms (would explode false positives).
    if (fuzzy) {
      const tf = fuzzyForm(t);
      if (tf.length >= 4 && fuzzyText.includes(tf)) {
        if (allowedHit) continue;
        return { blocked: true, matched: term, mode: "fuzzy" };
      }
    }

    // 3. Bounded edit distance against word windows. Skip short / multi-word
    //    very long terms to bound CPU.
    if (editDistance) {
      const tf = fuzzyForm(t);
      if (tf.length < 5 || tf.length > 24) continue;
      // 1 edit per ~6 chars, capped at 2 — keeps false positives in check.
      const maxDist = Math.min(2, Math.floor(tf.length / 6));
      if (maxDist < 1) continue;
      for (const w of windows) {
        if (Math.abs(w.length - tf.length) > maxDist) continue;
        if (boundedEditDistance(w, tf, maxDist) <= maxDist) {
          if (allowedHit) continue;
          return { blocked: true, matched: term, mode: "edit" };
        }
      }
    }
  }
  return { blocked: false };
}

/**
 * Create a proxied Supabase client that automatically scopes all queries for multi-tenant isolation.
 * Intercepts:
 *   - .from(table) calls for tenant-scoped tables.
 *   - Automatically appends `.eq("user_id", tenantId)` to `.select()`, `.update()`, and `.delete()`.
 *   - Automatically injects `user_id = tenantId` on `.insert()` and `.upsert()`.
 */
export function createTenantClient(sbClient: any, tenantId: string): any {
  const scopedTables = [
    "api_keys",
    "endpoints",
    "endpoint_shares",
    "policies",
    "policy_settings",
    "policy_rules",
    "policy_intents",
    "request_logs",
    "audit_logs",
    "model_aliases",
    "routes",
    "route_steps",
    "regression_tests"
  ];

  return new Proxy(sbClient, {
    get(target, prop, receiver) {
      if (prop === "from") {
        return function (table: string) {
          const builder = target.from(table);
          if (!scopedTables.includes(table)) return builder;

          return new Proxy(builder, {
            get(builderTarget, builderProp, builderReceiver) {
              if (builderProp === "insert" || builderProp === "upsert") {
                return function (values: any, options: any) {
                  if (Array.isArray(values)) {
                    values.forEach((v) => {
                      if (v && typeof v === "object") v.user_id = tenantId;
                    });
                  } else if (values && typeof values === "object") {
                    values.user_id = tenantId;
                  }
                  const origMethod = Reflect.get(builderTarget, builderProp, builderReceiver);
                  return origMethod.call(builderTarget, values, options);
                };
              }

              if (builderProp === "select" || builderProp === "update" || builderProp === "delete") {
                const origMethod = Reflect.get(builderTarget, builderProp, builderReceiver);
                return function (...args: any[]) {
                  const nextBuilder = origMethod.apply(builderTarget, args);
                  return nextBuilder.eq("user_id", tenantId);
                };
              }

              return Reflect.get(builderTarget, builderProp, builderReceiver);
            },
          });
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

