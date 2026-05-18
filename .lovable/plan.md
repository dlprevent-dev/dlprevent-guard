## Goal

Let users tailor policy templates instead of being stuck with the three hardcoded ones. Two flows:

- **Duplicate & edit** — fork a built-in into a new custom template.
- **Edit in place (override)** — modify a built-in for this project, with **Reset to default**.
- Custom templates also gain an **Edit** action (today they can only be deleted).

## UI changes (`policy-templates-section.tsx`)

Built-in template card actions become: `Apply` · `Edit` · `Duplicate` · `Test`. When an override exists for a built-in, show an **"Edited"** badge on the card and replace the existing Reset/Delete-style action with **"Reset to default"** (icon button) next to Edit.

Custom template card actions become: `Apply` · `Edit` · `Test` · `History` · `Delete`.

Override detection: query `list_policy_templates`, find rows whose `id` matches `builtin:<template_id>` (see backend section). If present, render its fields over the hardcoded built-in (name, tagline, highlights, policy, settings, rules) so the card and Apply both reflect the override.

## Wizard changes (`template-wizard-dialog.tsx`)

Today the wizard always creates a new template from current project state. Extend it to accept an optional `initialTemplate` prop:

```ts
initialTemplate?: {
  id?: string;              // when set → update; when unset → create
  name: string;
  description?: string;     // = tagline
  highlights?: string[];    // new editable field, shown as a string list editor
  policy: Record<string, any>;
  settings: Record<string, any>;
  rules: Rule[];
  applies_to_intents?: string[];
  unknown_intent_fallback?: "apply_no_rules" | "apply_default_rules" | "reject";
  origin?: "builtin" | "custom"; // drives "Edit built-in" copy + the override id
  builtinId?: TemplateId;        // used to compute id = `builtin:${builtinId}` on save
};
```

- **Duplicate built-in** → open with `initialTemplate = builtinDef`, `id` cleared, `name = "<name> (copy)"`, `origin: "custom"`.
- **Edit built-in** → same prefill, but on save the wizard sends `id = "builtin:<builtin_id>"`, `origin: "builtin"`. This creates/updates a single override row tied to that built-in.
- **Edit custom** → prefill with the existing `policy_templates` row; saving updates by `id` (the backend's `save_policy_template` already handles upsert).

Add a small "Highlights" step (or inline list editor in the metadata step) for the 3-5 bullet strings shown on the card. Persisted inside `settings.__highlights` (string[]) — no schema change needed, the card reads it back.

When the source is built-in and the wizard opens in **Edit in place** mode, the title bar reads "Edit built-in template — <name>" and the footer shows "Save override". Duplicate mode shows the existing "Save as new template" flow.

## Reset to default

New action calls `delete_policy_template` with `id = "builtin:<builtin_id>"`. After success, invalidate `policy_templates` query — the card falls back to the hardcoded definition.

## Backend

`save_policy_template` (in `supabase/functions/dashboard/index.ts`) currently treats `id` as a UUID generated server-side. Two small changes:

1. Allow the client to supply `id` on create when it matches the pattern `^builtin:[a-z_]+$`. Continue auto-generating UUIDs otherwise.
2. Add a `highlights text[]` column? **No** — store inside the existing `settings` JSON under `__highlights` to avoid a migration.

No other RLS/policy changes; the existing `user_id` scoping on `policy_templates` already isolates overrides per project.

## Out of scope

- No changes to `Apply template` semantics, rules engine, sandbox.
- No edits to `template-test-dialog`, `template-history-dialog`, `template-apply-preview-dialog`.
- Built-in template *definitions* in code stay as the fallback/default that "Reset to default" returns to.

## Files touched

- `src/components/policies/policy-templates-section.tsx` — card actions, override merge, Reset to default.
- `src/components/policies/template-wizard-dialog.tsx` — `initialTemplate` prop, edit/override modes, highlights editor.
- `supabase/functions/dashboard/index.ts` — accept `builtin:<id>` ids in `save_policy_template`.
