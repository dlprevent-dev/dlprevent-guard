## Goal

Make the core flow one obvious thing:

> **Paste a provider key → AnveGuard returns an OpenAI-compatible URL + key → every call goes through guardrails and shows up in Logs.**

The plumbing for this already exists (`create_key` in `dashboard` edge function already accepts `provider`, `provider_key`, and `custom` and binds a new `ag_live_*` key to the upstream). The change is mostly UX + a guided wizard, not new backend.

## What changes

### 1. New "Connect" wizard (primary entry point)

New page `src/pages/dashboard/Connect.tsx` and route `/dashboard/connect`. Three-step single-screen wizard:

1. **Pick provider** — visual grid: OpenAI, Anthropic, Google, OpenRouter, Perplexity, Ollama, Groq, Mistral, "Custom OpenAI-compatible". Each tile shows logo, short description, and a "Get key →" deep-link to the provider's key page.
2. **Paste key + test** — single field for the provider key, "Test connection" button (already implemented as `test_custom_endpoint` / live key list call), inline pass/fail with the first model name on success.
3. **Get your AnveGuard credentials** — calls `create_key`, then shows:
   - `Base URL: https://anveguard.app/v1` (copy)
   - `API Key: ag_live_…` (copy, one-time reveal)
   - 3-tab snippet (Python / Node / curl) prefilled with the new key
   - "Send a test request" button that fires a tiny chat completion through the proxy and links to the resulting Logs row.

Make this the default landing page for empty workspaces (no keys yet) — the existing `Overview` "Next step" card links here.

### 2. Reframe Keys + Endpoints

- **Keys page**: rename primary CTA from "New key" to **"Connect a provider"** → opens the new wizard. Keep the existing table.
- **Endpoints page**: demote to **"Advanced → Custom endpoints"** in the sidebar. Add a callout at top: *"Most users don't need this. Use Connect to add OpenAI, Anthropic, OpenRouter, Perplexity, Ollama, and more in one click."*
- Sidebar order: `Overview · Connect · Logs · Threats · Policies · Playground · ··· Advanced (Endpoints · Routes · Providers · Alerts)`.

### 3. Provider catalog expansion

`list_providers` in `supabase/functions/dashboard/index.ts` already returns the provider list + a custom-endpoint template list. Add first-class entries (with logo + key-URL + default model) for:

- OpenRouter (`https://openrouter.ai/api/v1`, key page `https://openrouter.ai/keys`)
- Perplexity (`https://api.perplexity.ai`, key page `https://www.perplexity.ai/settings/api`)
- Ollama (default `http://localhost:11434/v1`, no key, with a banner: "Your proxy must reach this host")
- Groq (`https://api.groq.com/openai/v1`)
- Mistral (`https://api.mistral.ai/v1`)

These are templates today; promoting them to first-class providers gives them logos + 1-click selection in the wizard.

### 4. Landing-page tweak (small)

Update the "How it works" / quickstart copy to mirror the wizard's 3 steps verbatim so visitors land on the page already understanding it: *Paste provider key → Get OpenAI-compatible URL → Ship.*

## What stays the same

- Proxy edge function, policy engine, guardrails, logging — zero changes. Every call still flows through the same pipeline that's already shipping.
- Existing Endpoints/Routes/Aliases for power users — untouched, just demoted in nav.
- Existing keys keep working (no data migration).

## Technical notes

- Connect wizard is pure frontend; it calls existing `list_providers`, `test_custom_endpoint`, and `create_key` dashboard actions.
- Provider catalog additions are a small edit to the static list in `dashboard/index.ts`'s `list_providers` handler — no migration needed.
- "Send a test request" button calls the live `proxy` function with the new key + a 1-token completion to populate Logs immediately, then `navigate('/dashboard/logs?focus=…')`.

## Out of scope

- New providers that aren't OpenAI-compatible at the wire level (would need new adapter code).
- Billing / spend caps.
- Per-key budgets (already on roadmap).

## Deliverable

A new `/dashboard/connect` wizard that takes a user from "I have an OpenAI key" to "I have an AnveGuard URL + key + first request visible in Logs" in well under 60 seconds, with Endpoints reframed as the advanced escape hatch.
