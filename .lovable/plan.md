
# Dual-mode targets + tests

## 1. Side-by-side OpenAI + Webhook on one target

Right now `agent_targets.api_type` is `'openai' | 'webhook'` and `config` holds one or the other. Switch the target to a dual-config shape so a single saved agent can hold BOTH and the user picks which to use per run.

### Schema (migration)
- Drop the `agent_targets_api_type_check` constraint and widen `api_type` to `'openai' | 'webhook' | 'dual'`.
- Add `config_openai JSONB` and `config_webhook JSONB`. Keep existing `config` for back-compat: a one-time UPDATE copies it into the matching new column.
- Add `eval_plans.transport TEXT NOT NULL DEFAULT 'openai'` so each run records which side it used.

### Backend (`supabase/functions/eval/index.ts`)
- `create_target` / new `update_target`: accept `config_openai` and `config_webhook` (either or both), set `api_type = 'dual'` when both are present.
- `ping_target`: accept `transport` arg (`openai` | `webhook`), default to whichever is configured.
- `callAgent(target, input, turns, transport)`: read the right sub-config based on `transport`. Falls back to the legacy `config` field when the new columns are empty.
- `create_plan` and `run_plan`: accept and persist `transport`; `run_plan` passes it through to `callAgent`.

### Frontend
- **TestLab → Agent endpoints**: replace single-type form with two collapsible sections ("OpenAI-compatible" and "Webhook") that can both be filled. Saved-endpoint card shows badges for which transports are configured and a "Test" dropdown to ping each.
- **New test run wizard**: when the chosen target has both, show a transport selector (radio: OpenAI / Webhook). When only one is configured, lock to that.
- **Plan list / report**: show the transport used as a small badge.

## 2. Testing

### Edge function unit tests (`supabase/functions/eval/index_test.ts`)
Extend the existing test file with Deno tests that call the deployed `eval` function end-to-end using the dev Clerk JWT pattern already in `index_test.ts`:
- `create_target` with `config_openai` only → returns target with `api_type='openai'`.
- `create_target` with both configs → `api_type='dual'`.
- `ping_target` with `transport='openai'` against `https://api.openai.com/v1` using LOVABLE-style stub URL → expect a structured error (no token) rather than a crash, proves the path is exercised.
- `ping_target` with `transport='webhook'` against `https://httpbin.org/post` with `body_template='{"q":"{{input}}"}'` and `response_path='json.q'` → expect echo of input.
- `create_plan` + `generate_plan_scenarios` with `question_count=20` → expect ≥10 scenarios across ≥2 categories and both `author_judge` values present.
- `approve_plan` + `run_plan` (still on httpbin webhook target) → expect a `run_id`, both `judge_a_score` and `judge_b_score` populated on results.

Run via `supabase--test_edge_functions` with `functions: ["eval"]`.

### Browser smoke test
After backend tests pass, drive the live preview:
1. `browser--view_preview` → navigate to `/dashboard/evaluate/test-lab`.
2. Create a webhook target pointing at `https://httpbin.org/post` with response path `json.input`.
3. Click Test, confirm 200.
4. Create a new run, count=20, generate, screenshot the review page.
5. Approve & Run, screenshot the report page (axis bars, per-question results, judge A/B scores visible).
6. Verify "Export PDF" opens the print dialog (don't actually save).

If any step fails, use `code--read_runtime_errors` + `supabase--edge_function_logs` to diagnose, fix, and re-run.

## Out of scope
- Notification webhooks (post run summary to Slack/Discord) — separate feature.
- Async/inbound callback webhooks — separate feature.
