
# AgentAssure Test Lab — End-to-End Flow

A guided workflow under the **Evaluate** section that takes a user from "I have an agent API" to "here's a graded report" in five stages.

## User Flow

```text
1. Connect Agent  →  2. Set Objectives  →  3. Generate Questions (Dual Judge)
                                                    │
                                                    ▼
                                          4. Review / Approve / Edit
                                                    │
                                                    ▼
                                          5. Run Against Agent
                                                    │
                                                    ▼
                                          6. Scored Report (PDF export)
                                          ↻ Retest  •  Update objectives
```

## Stage Details

### 1. Connect Agent
- New page `dashboard/evaluate/TestLab` with a "New Test Run" wizard.
- API type picker (auto-detect + manual override):
  - **OpenAI-compatible**: base URL, model name, bearer token
  - **Generic HTTP webhook**: method, URL, headers (KV editor), JSON body template with `{{input}}` placeholder, JSONPath for response text
- "Test connection" button sends a ping payload and shows the raw response so the user can confirm parsing.
- Stored in new `agent_targets` table (encrypted token via existing `KEY_ENCRYPTION_SECRET`).

### 2. Set Objectives
- Free-text "what should this agent do / not do" plus structured fields:
  - Domain/role (e.g. "customer support for SaaS")
  - Must-do behaviors (chips)
  - Must-not-do / safety constraints (chips)
  - Tone & style
  - Reference docs (optional paste)
- **Slider: question count** (20 → 1000, default 200)
- Axis weights (faithfulness / relevance / safety / robustness) with sensible defaults.

### 3. Generate Questions (Dual Judge)
- Edge function `eval-generate` fans out to BOTH judges **in parallel**:
  - `google/gemini-3.1-flash-lite` via OpenRouter
  - `z-ai/glm-4.6` via OpenRouter (replacing the placeholder "5.2")
- Each judge generates `N/2` scenarios across categories: happy-path, edge cases, adversarial/jailbreak, safety, out-of-scope, multi-turn.
- Deduped + merged into one set. Stored in `eval_scenarios` linked to a new `eval_plans` row (status = `pending_review`).
- Returns a **summary card**: counts per category, sample questions, estimated cost & runtime.

### 4. Review / Approve / Edit
- Table view of all generated questions with category, expected behavior, and which judge authored it.
- Bulk actions: approve all, delete, regenerate selected, add custom question.
- Inline edit of expected behavior.
- "Approve & Run" locks the plan (`status = approved`) and triggers stage 5.

### 5. Run Against Agent
- Edge function `eval-run` iterates approved scenarios:
  - Calls the user's agent API (with retries, timeout, latency capture)
  - Sends agent response to **both judges in parallel**
  - Final score = **average** of both judges per axis; disagreement (>0.3 delta) flagged for review
- Streams progress to the UI via Supabase Realtime on `eval_runs` row.
- Stores per-scenario: agent response, both judge scores, averaged score, confidence (1 − |delta|), tokens, latency.

### 6. Report
- Dashboard view: overall pass rate, per-axis radar, per-category bars, confidence distribution, flagged disagreements, top failures with rationales.
- Actions:
  - **Export PDF** (server-side render via edge function `eval-report-pdf` using a templated HTML → PDF)
  - **Retest** (re-run same approved plan against the agent)
  - **Update** (edit objectives / regenerate questions, fork into new plan)

## Technical Details

### New tables (migration)
- `agent_targets` — id, user_id, name, api_type (`openai`|`webhook`), config jsonb, encrypted_token, created_at
- `eval_plans` — id, user_id, agent_target_id, objectives jsonb, question_count, weights jsonb, status (`pending_review`|`approved`|`archived`), summary jsonb
- Extend `eval_scenarios` — add `plan_id`, `category`, `author_judge`, `approved` bool
- Extend `eval_runs` — add `plan_id`, `progress` int, `flagged_count` int
- Extend `eval_results` — add `judge_a_score`, `judge_b_score`, `confidence`, `disagreement` numeric, `judge_a_rationale`, `judge_b_rationale`

All public tables get explicit GRANTs + RLS scoped to `auth.uid()`.

### Edge functions
- `eval-agent-ping` — validates user's agent API connection
- `eval-generate` — parallel dual-judge question generation
- `eval-run` — executes approved plan, calls agent, parallel-judges results
- `eval-report-pdf` — renders PDF from run results

All judge + generation calls go through OpenRouter using existing `OPENROUTER_API_KEY`. Agent inference uses the user-provided endpoint, not OpenRouter.

### Frontend
- Routes: `/dashboard/evaluate/test-lab`, `/test-lab/:planId/review`, `/test-lab/runs/:runId`
- Components: `AgentConnectForm`, `ObjectivesForm`, `GenerationSummary`, `ScenarioReviewTable`, `RunProgress`, `ReportView`
- Realtime subscription on `eval_runs` for live progress bar.

### Out of scope (this plan)
- CSV/JSON/Markdown exports (PDF only per your choice)
- Scheduled recurring runs (can be added later via existing cron infra)
