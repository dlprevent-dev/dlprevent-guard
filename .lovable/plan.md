## Goal

Let users edit an existing connector (AnveGuard key) from the Keys page so they can: add more LLMs, attach an already-configured endpoint, rename it, change the default model, or swap the primary provider — without revoking and recreating.

## What exists today

- `Connect.tsx` already supports `?key=<id>` and hydrates name + default model into Step 2 ("attach more LLMs"). Backend `save_endpoint` / `save_alias` / `list_aliases` already work.
- Missing: no Edit button on Keys, no UI to rename / change default model / change primary provider, and no shortcut to attach an existing endpoint (today Step 2 always creates a new endpoint).

## Changes

### 1. `src/pages/dashboard/Keys.tsx` — Edit entry point
Add a pencil button on each active key row (next to Code / Tags / Beaker) that navigates to `/dashboard/connect?key=<id>`. Tooltip: "Edit connector — add LLMs, change provider, rename".

### 2. `src/pages/dashboard/Connect.tsx` — Edit mode upgrade
Rebrand Step 2 header in edit mode to "Edit connector — {name}" and split it into three tabs/sections:

**a. Workspace settings**
- Editable `name` and `model_default` inputs.
- "Save" calls a new `update_key` API (name + model_default) — falls back to existing edge mutation pattern if one is present; otherwise add a small `update_key` handler call.

**b. Primary provider**
- Show current provider as a card with a "Change provider" button.
- Clicking opens the Step 0 tile grid in a dialog; selecting a tile + entering a new key calls `update_key` with `{ provider, provider_key, endpoint_id? }` to repoint the workspace's upstream. Confirms with a "This will route all unaliased model calls to the new provider" warning.

**c. Attached LLMs** (existing Step 2 list, enhanced)
- Keep the "Add another LLM" drawer.
- Add a second CTA "Attach existing endpoint" that lists `endpointsQuery.data.endpoints` not yet aliased and lets the user pick one + give it an alias — calls `save_alias` only (no new endpoint, no new key paste).
- Each alias row gets an inline "Edit alias" affordance (rename alias / change target model/endpoint) + existing remove button.

### 3. Hydration fix
`useEffect` for `editKeyId` already sets `created = { fullKey: "", id }`. Extend it to also fetch the key's current `provider` and `endpoint_id` so the "Primary provider" card can render the right tile label.

### 4. Out of scope
- No new tables, no schema changes.
- Plaintext `ag_live_…` is never re-shown in edit mode (rotation stays a separate action on Keys page).
- No changes to landing page or pricing.

## Files touched
- `src/pages/dashboard/Keys.tsx` (add Edit button)
- `src/pages/dashboard/Connect.tsx` (edit-mode UI: rename, change provider dialog, attach-existing-endpoint flow)
- Possibly one new backend handler `update_key` if not already present — will verify before adding; otherwise reuse existing.
