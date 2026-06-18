
# Add "Evaluation & Productivity" to AnveGuard

Bring AgentAssure-style capability into AnveGuard as a **new top-level section** in the dashboard, sitting alongside today's runtime governance (Policies, Logs, Threats, Regression Tests). The runtime side stays untouched — this adds the *pre-deploy quality* and *post-deploy ROI* lens that the business plan describes.

## New sidebar section: "Evaluate"

Three new pages, grouped under a new "Evaluate" header in the dashboard sidebar:

1. **Test Suites** — offline evaluation harness
2. **Scenarios** — auto-generated multi-turn test cases
3. **Productivity** — ROI / cost / latency dashboards

Plus one new public docs page: **Docs → Evaluation**.

---

## 1. Test Suites (`/dashboard/evaluate/suites`)

Reuses and extends today's `regression_tests` table — same idea, bigger scope.

- List view of suites (grouped runs of tests against a chosen endpoint + model)
- Create suite: pick endpoint, model alias, dataset (CSV upload or scenarios from page 2), choose graders
- Graders available out of the box:
  - Exact / contains / regex (cheap, deterministic)
  - **RAGAS-style retrieval**: faithfulness, answer relevance, context precision (when the request carries `context`)
  - **LLM-as-judge** via Lovable AI Gateway (Gemini default — free during promo) with versioned judge prompts for reproducibility
  - Safety: re-uses the existing 172-test attack corpus + injection guard
- Run view: pass/fail per test, judge rationale, token spend, latency p50/p95, diff vs previous run
- "Promote failing case → policy rule" button (closes the loop with our existing policy engine)

## 2. Scenarios (`/dashboard/evaluate/scenarios`)

Automated scenario generation, the "Rhesis-style" capability from the brief.

- Input: a short description of the agent's job + (optional) its system prompt
- Generates N multi-turn scenarios across categories: happy path, edge case, adversarial, tool-misuse, long-horizon
- Each scenario is saved as a row in a new `eval_scenarios` table and can be added to any suite
- Generation uses Lovable AI Gateway; the prompt template is versioned so re-runs are reproducible

## 3. Productivity (`/dashboard/evaluate/productivity`)

ROI / operational dashboard. **No new data collection needed** — everything is already in `request_logs` (latency, tokens, tool calls, verdicts, request_id, upstream_latency).

Tiles:
- Task success rate (verdict = allow & no downstream error)
- Cost per task (tokens × model price from `model_aliases`)
- p50 / p95 latency, upstream vs total
- Token efficiency trend (last 7 / 30 / 90 days)
- Adoption: requests per API key, per endpoint, per team
- Block / flag / allow mix over time
- Top blocked rules and top tool calls
- Filter by endpoint, model alias, date range, API key

Exportable as CSV and as a shareable PDF report (same renderer used for the briefing PDF).

## 4. Docs page

New page at `/docs/evaluation` explaining: what eval is, how it differs from runtime guard, when to use each, how to wire a CI job that fails the build on regressions. Linked from `/docs/overview`.

---

## How this lands relative to existing surface

- **No removal, no rename.** Today's Logs, Policies, Threats, Regression Tests stay exactly where they are.
- The existing **Regression Tests** page becomes the simplest case of a Test Suite (a suite with a single grader). We keep the page as-is and add a "View in Evaluate" link.
- New section is **gated behind a feature flag** on `policy_settings` (`enable_evaluation`, default off) so existing tenants see no change until they opt in.

---

## Technical details

**Database (one migration, with GRANTs + RLS in the same migration per project rules):**

- `eval_suites` — id, tenant_id, name, endpoint_id, model_alias, grader_config jsonb, created_at, created_by
- `eval_scenarios` — id, tenant_id, suite_id (nullable), category, turns jsonb, expected jsonb, source ('generated' | 'manual' | 'imported'), created_at
- `eval_runs` — id, tenant_id, suite_id, status, started_at, finished_at, summary jsonb (counts, p50, p95, cost)
- `eval_results` — id, run_id, scenario_id, verdict, score numeric, judge_rationale text, tokens_in int, tokens_out int, latency_ms int, request_log_id (fk to request_logs)
- Extend `policy_settings`: add `enable_evaluation boolean default false`

All four new tables: RLS by `tenant_id = auth.uid()`-equivalent (same pattern as `regression_tests`), GRANT SELECT/INSERT/UPDATE/DELETE to `authenticated`, GRANT ALL to `service_role`.

**Edge functions:**

- New `eval-run` function: takes a suite_id, fans out scenarios through the existing `proxy` function (so every eval request gets the same governance), records results. Idempotent per (run_id, scenario_id).
- New `eval-generate` function: calls Lovable AI Gateway (Gemini) to produce scenarios from a description; rate-limited, tenant-scoped.
- Reuse the existing `proxy` for all model calls — no separate model integration, no new secrets.

**Frontend (no backend changes for productivity):**

- `src/pages/dashboard/evaluate/Suites.tsx`, `Scenarios.tsx`, `Productivity.tsx` (lazy-loaded routes)
- Add 3 sidebar entries under a new "Evaluate" group in `src/components/dashboard-sidebar.tsx`
- Productivity tiles are pure SQL against `request_logs` via `supabase--read_query` patterns already used by Overview / Logs
- PDF export reuses the reportlab approach used for the client briefing, served from a new `report-export` edge function

**No new third-party SaaS, no new paid API keys.** Everything runs on Lovable Cloud + Lovable AI Gateway.

**Out of scope for this iteration** (can be follow-ups):
- Integrating external benchmarks (GAIA, OSWorld, TerminalBench)
- Cross-tenant industry benchmarking (raises real privacy questions)
- A "judge model marketplace" — v1 ships with Gemini default + a single config field to point at any OpenAI-compatible endpoint

---

## Rough order of work

1. Migration + types regen
2. Sidebar entry + empty page scaffolds (behind feature flag)
3. Productivity page (fastest win — data already exists)
4. Test Suites CRUD + `eval-run` edge function
5. Scenarios CRUD + `eval-generate` edge function
6. PDF export + docs page
7. Feature-flag UI toggle in Policies → Feature Config

Each step is independently shippable.
