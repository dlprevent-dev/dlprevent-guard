## Plan

Declutter `src/pages/dashboard/Policies.tsx` without touching any of the six section components.

### Changes

1. **Remove the sticky in-page chip nav** (the `<nav>` block with anchor chips). Anchors are no longer needed once the page is mostly collapsed.
2. **Remove the Simple / Advanced toggle** in the header and the `useShowAdvanced` hook + localStorage key. All six sections are always present — the page stays calm because everything except Guardrails is collapsed by default.
3. **Wrap each section in a small `<CollapsibleSection>` shell** (a thin local component in this file, built on shadcn `Collapsible` + a button trigger). Each row shows: section label, one-line hint, and a chevron. Click expands and renders the existing section component underneath. No changes inside the six existing section components — so all current logic, validation, save flows are preserved.
4. **Default open state**: `guardrails`. Everything else (`compression`, `alerts`, `templates`, `intents`, `rules`) starts collapsed.
5. **Keep** the `PageHeader` and the "Test in sandbox" button. Update the description to a single short sentence.
6. **Persist open/closed state** per section in `localStorage` under `anveguard.policies.open_sections` so a user who opens Alerts once doesn't have to re-open it on every visit. Falls back to default-open Guardrails on first load and in private mode.
7. **Hash deep-link support**: if the URL has `#<section-id>` (e.g. `#intents` from existing links), auto-open that section on mount and scroll it into view. This preserves the current `/dashboard/policies#intents` route the user is on.

### Files touched

- `src/pages/dashboard/Policies.tsx` — full rewrite (file is 136 lines; cleaner to replace than patch).

### Out of scope

- No edits to the six section components or any of their dialogs.
- No changes to routing, sandbox page, or API surface.
- No removal of any policy capability — everything still reachable, just one click away.
