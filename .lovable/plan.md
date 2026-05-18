## Context

The actual `ag_live_…` secret **cannot be prefilled from storage** — AnveGuard only keeps a salted hash, and the plaintext is shown exactly once at creation. So "prefill the AnveGuard API key field" cannot mean "fetch the secret and drop it in the input".

What it can (and should) mean: when a signed-in dashboard user picks a key from the dropdown, the Playground proves identity with their Clerk session + the chosen key's ID, and the proxy authorizes the request without the user touching `ag_live_…` at all. The current Playground does not do this (the earlier implementation was lost during the recent `main` ↔ edit-branch sync drift), which is why you're back to pasting the secret manually.

## Plan

### 1. Edge function: dual auth path (`supabase/functions/proxy/index.ts`)

Add a `resolveProxyKeyAuth(req)` helper used by every proxy handler that needs a key. It accepts either:

- **A.** `Authorization: Bearer ag_live_…` — current behaviour, hash + lookup.
- **B.** `Authorization: Bearer <Clerk JWT>` plus `x-anveguard-key-id: <uuid>` — verify the JWT, load the key row by id, require `key.user_id === claims.sub`. No secret needed.

Both paths return the same resolved `{ keyRow, endpoint }` shape so downstream code is unchanged. Path B is only honoured for requests originating from the dashboard session — the public `ag_live_…` flow for end-user apps is untouched.

### 2. Playground frontend (`src/pages/dashboard/Playground.tsx`)

- When `selectedKey` is set, the AnveGuard API key input collapses to a read-only badge: **"Using your dashboard session — `perplexity-e2e`"** with a small "Use a pasted key instead" link that re-reveals the input (fallback for power users / shared screens).
- All outbound proxy calls (chat/completions, models list, test-connection) get a new `buildAuthHeaders()` helper:
  - If session mode → `Authorization: Bearer <clerk-token>` + `x-anveguard-key-id: <selectedKey.id>`.
  - Else → existing `Authorization: Bearer <pasted ag_live_…>`.
- The "1 configured endpoint can't be used yet" banner stays as-is — that's about endpoints with **no** bound key, which is a separate problem.

### 3. Help copy

Update the `HelpHint` next to the key field and the `HelpPanel` step that says "paste your `ag_live_…`" so signed-in users see: *"When you pick a key from the dropdown the Playground signs requests with your dashboard session — you only need to paste a secret if you're testing as an external app."*

### Files touched

- `supabase/functions/proxy/index.ts` — add `resolveProxyKeyAuth`, wire it into the request handlers.
- `src/pages/dashboard/Playground.tsx` — `showPasteKey` state, collapsed indicator, `buildAuthHeaders`, update the three call sites.

### Out of scope

- Recovering / displaying the original `ag_live_…` secret (cryptographically impossible; would require switching from hashing to reversible encryption — explicit security regression, not doing it).
- The unbound-endpoint banner and any changes to key creation.
- The previously-discussed "Test connection" button — say the word and I'll fold it back in here too, since that work also got lost.
