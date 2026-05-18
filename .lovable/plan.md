## Goal

One AnveGuard API key, multiple LLM providers behind it. Users connect OpenAI, Anthropic, OpenRouter, Ollama, etc. under a single `ag_live_*` key and pick the provider per request by passing a model name (e.g. `gpt-4o`, `claude-sonnet`, `llama3-local`). All traffic stays inside the same policy/guardrail/logging context.

## What already exists (no backend changes needed)

- `endpoints` table — stores per-provider upstream config (base_url, key, auth, paths).
- `model_aliases` table — maps `(api_key_id, alias)` → `(target_model, target_endpoint_id)`. The proxy already swaps to the alias's target endpoint at request time (see `proxy/index.ts` ~L956–966, L1443–1451).
- Dashboard actions: `save_endpoint`, `list_endpoints`, `save_alias`, `list_aliases`, `delete_alias`.
- One AnveGuard key (`api_keys` row) can already fan out to N endpoints via aliases — the UI just doesn't expose it as a first-class concept.

## What changes (frontend only)

### 1. Rework `Connect.tsx` into a "Workspace" model

Current wizard: pick 1 provider → paste key → get AnveGuard key (1:1).

New wizard:

```
Step 1 — Name your AnveGuard workspace
   "Production", "Staging", etc. → becomes the api_keys.name

Step 2 — Connect providers (repeatable)
   [+ Add provider] tile grid: OpenAI / Anthropic / OpenRouter / Perplexity /
   Gemini / Groq / Mistral / Ollama / Lovable AI / Custom
   For each: paste key → Test → save as an endpoint row
   Show a running list of connected providers with status chips
   User can add as many as they want, then continue

Step 3 — Map model names (auto + manual)
   For each connected provider, auto-suggest aliases from its default model list:
     gpt-4o            → openai endpoint, model gpt-4o
     claude-sonnet-4   → anthropic endpoint, model claude-sonnet-4-...
     llama3            → ollama endpoint,  model llama3
   User can rename aliases, remove, or add custom ones.
   Show a preview: "Calling model: X → routes to Y on provider Z"

Step 4 — Your AnveGuard credentials
   Base URL + ag_live_* key + 3-tab snippets (Python / Node / curl)
   Snippets show 2–3 example model calls demonstrating multi-provider routing
   "Send test request" button picks one alias and fires it
```

### 2. Reframe sidebar + existing pages

- `Keys` page: each AnveGuard key card now shows a "Connected providers" sub-list (count + chips) and a "Models" sub-list (alias count). "Manage" deep-links into the wizard in edit mode for that key.
- `Endpoints` page: keep as-is for power users, but the callout becomes "Managed automatically by Connect — edit here only for advanced cases."
- `Routes` page: unchanged (multi-step fallback chains are a separate concept).

### 3. Edit mode for an existing workspace

Hitting `/dashboard/connect?key=<api_key_id>` loads existing endpoints+aliases tied to that key and lets the user add/remove providers and aliases in place. Same UI, pre-populated.

### 4. Landing page copy tweak

Update the "How it works" section to: "Connect one or many LLMs → get one AnveGuard key → call any model from any app." Reflects the multi-provider story.

## Out of scope

- No DB migration. No proxy changes. No new providers beyond the existing catalog.
- No automatic failover/routing rules (that's `Routes`).
- No billing/spend caps per provider.

## Technical notes

- Aliases are scoped to `(api_key_id, alias)` — the wizard groups by `api_key_id` so one workspace = one key + N endpoints + N aliases.
- The proxy already honors `target_endpoint_id` on an alias, so no resolver changes.
- Default alias suggestions come from each provider's `model_suggestions` (already on `endpoints`).

Files touched (estimate):
- `src/pages/dashboard/Connect.tsx` — rewrite to multi-step + repeatable provider list
- `src/pages/dashboard/Keys.tsx` — add providers/models sub-list per card
- `src/pages/dashboard/Endpoints.tsx` — callout copy
- `src/pages/Landing.tsx` — "How it works" copy
