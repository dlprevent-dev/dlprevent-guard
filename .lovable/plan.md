## Goal

When you pick an AnveGuard key from the Playground dropdown, you shouldn't have to paste the `ag_live_…` secret again. And the Test action should live right inside the Playground request pane, not only in the page header.

## Why the paste is required today

The proxy authenticates by hashing the incoming `Authorization: Bearer ag_live_…` and looking up the key row. Raw secrets are never stored — they're shown once at creation and gone. So "autofetch the key" can't mean "read the secret back from the server". Instead we let the dashboard itself send on behalf of the user, using their Clerk session.

## Approach

Add a **dashboard-authenticated bypass path** to the proxy: when the caller is a signed-in dashboard user (Clerk JWT, not `ag_live_…`), the proxy accepts an `x-anveguard-key-id` header and resolves the key server-side after verifying the key belongs to that user's workspace. All policy / logging / rate-limit behavior stays identical — it's just an alternate authentication on the proxy edge.

Frontend then stops asking for the secret whenever a key is selected from the dropdown.

## Changes

### Backend — `supabase/functions/proxy/index.ts`
- Branch at the top of the request:
  - If `Authorization: Bearer ag_live_…` → existing path, unchanged.
  - Else if `Authorization: Bearer <Clerk JWT>` **and** header `x-anveguard-key-id` is present → verify Clerk JWT, load the api_key row, assert `api_key.user_id === claims.sub` (or workspace membership for shared endpoints), then continue with that key as if it had been resolved from a secret.
  - Else → existing 401.
- Tag logs from this path with `source: "playground"` (new column already supported, or stash in `metadata`) so production traffic and dashboard tests are distinguishable in Logs.
- Reject this bypass for any key whose `is_active = false` or whose endpoint is shared-but-not-owned-by caller.

### Frontend — `src/pages/dashboard/Playground.tsx`
- Drop the manual `ag_live_…` input whenever `selection.kind === "key"`. Keep it only as a fallback when the user wants to test a key from another browser (collapsible "Use a pasted key instead" link).
- `send()` becomes: if a key is selected, send with Clerk token + `x-anveguard-key-id: <selectedKey.id>`; otherwise fall back to the pasted secret.
- Add an inline **"Test connection"** button inside the request pane, directly under the key picker (in addition to the existing header button). One click sends the canned `Reply with the single word: pong.` non-streamed and shows pass/fail next to the picker — no need to touch the prompt area.
- Update the HelpPanel copy: step 2 ("Paste the key secret") is replaced with "Pick a key — the dashboard authenticates for you. Paste a key only if it was created in another browser."

### Tests
- New Deno test in `supabase/functions/proxy/`: dashboard-JWT + `x-anveguard-key-id` path returns 200 for owner, 403 for cross-user, 401 for missing header.
- Update `e2e/07-full-journey.spec.ts` step 3/4: the Playground steps no longer fill the `ag_live_…` field once a key is selected; assert the new inline Test button works.
- Leave the existing pasted-key tests in place (covers the fallback).

## Out of scope

- No change to production proxy clients — they still send `ag_live_…` and nothing about that path changes.
- No persistent client-side caching of secrets.
- No new tables or migrations.

## Files touched

```text
supabase/functions/proxy/index.ts          (auth branch + tests)
supabase/functions/proxy/*_test.ts         (new cases)
src/pages/dashboard/Playground.tsx         (UI + send logic + inline Test)
e2e/07-full-journey.spec.ts                (drop paste step, add Test assertion)
```
