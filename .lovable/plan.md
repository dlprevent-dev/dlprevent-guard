# Test Lab Wizard

Convert the existing Test Lab into a linear, step-by-step wizard that mirrors the flow you described. Each step is one focused screen with Back / Next controls and a progress indicator at the top. No step is skippable — the user moves through them in order.

## The 6 steps

```text
[1 Connect] → [2 Objectives] → [3 Generate] → [4 Review] → [5 Run] → [6 Report]
```

**Step 1 — Connect your agent**
One screen to enter the agent under test. Tabs for OpenAI-compatible API and Webhook (or both — dual mode). Inline "Test connection" button (calls `ping_target`) with green/red status before Next is enabled.

**Step 2 — Set objectives**
User names the test plan and writes the objectives in plain language (what the agent is supposed to do, who it serves, what it must refuse). Optional fields: domain tags, tone, must-include/must-avoid phrases. A slider sets question count (10–500).

**Step 3 — Judges generate questions**
Auto-runs `generate_plan_scenarios` on entry. Live progress: "Gemini 2.5 Flash drafting… GLM-4.6 drafting… merging…". Shows a streaming counter as scenarios land. User waits — Next unlocks when generation completes.

**Step 4 — Review the question set**
Full list of generated scenarios grouped by category, each with the prompt, expected behavior, and which judge proposed it. User can: edit a prompt inline, delete a scenario, regenerate a single one, or click "Approve all & continue". This is the human gate before any call hits their agent.

**Step 5 — Run against the agent**
On entry, calls `run_plan` with the chosen transport (OpenAI / Webhook / both side-by-side if dual). Live progress bar with current scenario, pass/fail counter, average latency, and a cancel button. Both judges score each response in parallel; scores are averaged.

**Step 6 — Report**
Final results: overall score, confidence band (judge agreement), pass rate, latency, cost, per-category breakdown, and the flagged failures with judge rationale. Three actions at the bottom: **Re-test** (re-run same plan), **Refine** (jump back to Step 2 with current objectives pre-filled to make a new plan), **Export PDF**.

## Layout & UX

- Sticky top wizard header with numbered steps, current step highlighted, completed steps checkmarked and clickable to go back (read-only).
- Single centered column, max-w-3xl, generous vertical spacing.
- Bottom action bar: `← Back` left, `Next →` / `Approve & Continue` / `Export` right.
- Browser back/forward maps to wizard back/forward via route params: `/dashboard/evaluate/wizard/:planId?/:step`.

## Technical notes

- New route `WizardTestLab.tsx` replaces the current TestLab cards layout; old TestLab kept as `/dashboard/evaluate/lab/legacy` for one release in case you want to compare.
- Wizard state lives in URL + DB (`eval_plans` row created at Step 2, so refresh-safe). Each step reads/writes the same plan row.
- Step 3 polls `eval_plans.status` until `generated`; Step 5 polls `eval_results` count vs `eval_plans.question_count` for progress.
- No schema changes. Reuses existing edge function actions: `create_target`, `ping_target`, `create_plan`, `generate_plan_scenarios`, `update_scenario`, `approve_plan`, `run_plan`, `report`.
- Existing `PlanReview.tsx` and `PlanReport.tsx` content is folded into Steps 4 and 6 of the wizard.

## Out of scope

- No changes to judge models, scoring math, or the edge function.
- No new export formats beyond the existing PDF.
- Notification/inbound webhooks remain out of scope.
