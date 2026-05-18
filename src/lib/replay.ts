/**
 * Request-replay handoff between the Logs page and the Playground.
 *
 * Why sessionStorage instead of URL params: a real conversation can include
 * 100k chars of context, which busts URL length limits in most browsers
 * (~8KB). sessionStorage survives the cross-route navigation but doesn't
 * persist beyond the tab, so it's gone after refresh — that's the desired
 * lifetime for a one-shot replay handoff.
 *
 * The payload is intentionally small + well-typed: only the bits the
 * Playground needs to reproduce a request. The Playground consumes it
 * once on mount and clears the slot so back/forward navigation doesn't
 * re-trigger the prefill.
 */

const STORAGE_KEY = "replay:pending";

export interface ReplayMessage {
  role: "system" | "user" | "assistant" | "tool" | "function";
  content: string;
}

export interface ReplayPayload {
  /** Source log id (audit trail; surfaces as "Replaying log abc-123…"). */
  logId: string;
  /** Source api_key_id from the log — Playground auto-selects if available. */
  apiKeyId?: string;
  /** Original model the request targeted. */
  model?: string;
  /** Full message array from the log. */
  messages: ReplayMessage[];
  /** Whether the original was streamed. */
  stream?: boolean;
  /** When the source request happened — for "replayed from <time>" label. */
  capturedAt?: string;
  /** Original verdict on the source log (helps user know what to expect). */
  originalVerdict?: string;
  /** Block reason on the source log (so user knows what was caught). */
  originalBlockReason?: string;
}

/**
 * Stash a replay payload in sessionStorage. Returns the URL the caller
 * should navigate to. Always navigate via React Router so the playground
 * mounts and triggers `consumePendingReplay`.
 */
export function stagePlaygroundReplay(payload: ReplayPayload): string {
  if (!payload.logId || !Array.isArray(payload.messages) || payload.messages.length === 0) {
    throw new Error("stagePlaygroundReplay: logId + non-empty messages required");
  }
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // sessionStorage may be unavailable (private mode quirks). Best-effort —
    // the playground will simply not prefill.
  }
  // The query param is informational — it shows the user that we're in
  // replay mode in the URL bar. The actual payload lives in sessionStorage.
  return `/dashboard/playground?replay=${encodeURIComponent(payload.logId)}`;
}

/**
 * Read and CONSUME the pending replay payload. After this call, the slot
 * is empty so a subsequent mount (e.g., user navigates away and comes back)
 * doesn't re-trigger the prefill.
 */
export function consumePendingReplay(): ReplayPayload | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(STORAGE_KEY);
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.logId !== "string" || !Array.isArray(parsed.messages)) return null;
    // Defensive: enforce minimal shape on each message.
    parsed.messages = (parsed.messages as unknown[])
      .filter((m): m is ReplayMessage =>
        !!m && typeof m === "object" &&
        typeof (m as { role?: unknown }).role === "string" &&
        typeof (m as { content?: unknown }).content === "string")
      .slice(0, 200); // Hard cap to keep payload sane
    if (parsed.messages.length === 0) return null;
    return parsed as ReplayPayload;
  } catch {
    return null;
  }
}

/** Discard any pending replay without consuming it. Used on manual reset. */
export function clearPendingReplay(): void {
  try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

/**
 * Extract the LAST user-role message content from a replay payload. Used
 * by the Playground which today only accepts one prompt-string in its
 * primary textarea. Returns empty string if no user message found.
 */
export function lastUserMessage(payload: ReplayPayload): string {
  for (let i = payload.messages.length - 1; i >= 0; i--) {
    const m = payload.messages[i];
    if (m.role === "user" && typeof m.content === "string") return m.content;
  }
  return "";
}

/**
 * Build a ReplayPayload from a Logs row (the shape persisted in
 * `request_logs`). Returns null if the row doesn't have replayable data
 * (e.g., a throttled request that never had a user message).
 */
export function payloadFromLogRow(row: {
  id: string;
  api_key_id?: string | null;
  model?: string | null;
  messages?: unknown;
  created_at?: string;
  verdict?: string | null;
  block_reason?: string | null;
} | null | undefined): ReplayPayload | null {
  if (!row || !row.id) return null;
  const rawMessages = Array.isArray(row.messages) ? row.messages : [];
  const messages = rawMessages
    .map((m): ReplayMessage | null => {
      if (!m || typeof m !== "object") return null;
      const role = (m as { role?: unknown }).role;
      const content = (m as { content?: unknown }).content;
      if (typeof role !== "string") return null;
      const allowedRoles = ["system", "user", "assistant", "tool", "function"];
      if (!allowedRoles.includes(role)) return null;
      // Normalize multimodal content to a string for the primary textarea.
      const stringContent =
        typeof content === "string" ? content :
        Array.isArray(content)
          ? content
              .map((p) =>
                p && typeof p === "object" && typeof (p as { text?: unknown }).text === "string"
                  ? (p as { text: string }).text
                  : "")
              .filter(Boolean)
              .join("\n")
          : JSON.stringify(content ?? "");
      return { role: role as ReplayMessage["role"], content: stringContent };
    })
    .filter((m): m is ReplayMessage => m !== null);
  if (messages.length === 0) return null;
  return {
    logId: row.id,
    apiKeyId: row.api_key_id ?? undefined,
    model: row.model ?? undefined,
    messages,
    capturedAt: row.created_at,
    originalVerdict: row.verdict ?? undefined,
    originalBlockReason: row.block_reason ?? undefined,
  };
}
