-- ============================================================================
-- Evaluation & Productivity module — new section in the dashboard.
-- Mirrors the regression_tests pattern: tenant by user_id (TEXT, FK to
-- profiles.clerk_user_id), RLS enabled deny-all (service-role only; the
-- dashboard edge function brokers access via createTenantClient).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. eval_suites
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.eval_suites (
  id              UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         TEXT        NOT NULL REFERENCES public.profiles(clerk_user_id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  description     TEXT,
  endpoint_id     UUID        REFERENCES public.endpoints(id) ON DELETE SET NULL,
  model_alias     TEXT,
  -- Grader config: which graders to run, with their thresholds.
  -- Shape: { graders: [{ kind:'exact'|'contains'|'regex'|'ragas'|'llm_judge'|'safety', config:{...} }] }
  grader_config   JSONB       NOT NULL DEFAULT '{"graders":[]}'::jsonb,
  enabled         BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.eval_suites TO authenticated;
GRANT ALL ON public.eval_suites TO service_role;

ALTER TABLE public.eval_suites ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS eval_suites_user_idx
  ON public.eval_suites (user_id, created_at DESC);

DROP TRIGGER IF EXISTS eval_suites_updated_at ON public.eval_suites;
CREATE TRIGGER eval_suites_updated_at
  BEFORE UPDATE ON public.eval_suites
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 2. eval_scenarios
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.eval_scenarios (
  id              UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         TEXT        NOT NULL REFERENCES public.profiles(clerk_user_id) ON DELETE CASCADE,
  suite_id        UUID        REFERENCES public.eval_suites(id) ON DELETE SET NULL,
  name            TEXT        NOT NULL,
  category        TEXT        NOT NULL DEFAULT 'happy_path',
  -- Multi-turn conversation: [{ role:'user'|'assistant'|'system'|'tool', content:'...' }]
  turns           JSONB       NOT NULL DEFAULT '[]'::jsonb,
  -- Optional expected outcome: { contains?:string[], regex?:string, equals?:string, verdict?:'allow'|'flag'|'block'|'sanitize' }
  expected        JSONB,
  -- Optional retrieved context for RAGAS-style graders.
  context         JSONB,
  source          TEXT        NOT NULL DEFAULT 'manual',
  enabled         BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.eval_scenarios DROP CONSTRAINT IF EXISTS eval_scenarios_category_check;
ALTER TABLE public.eval_scenarios ADD CONSTRAINT eval_scenarios_category_check
  CHECK (category IN ('happy_path','edge_case','adversarial','tool_misuse','long_horizon','safety','retrieval'));

ALTER TABLE public.eval_scenarios DROP CONSTRAINT IF EXISTS eval_scenarios_source_check;
ALTER TABLE public.eval_scenarios ADD CONSTRAINT eval_scenarios_source_check
  CHECK (source IN ('manual','generated','imported','captured'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.eval_scenarios TO authenticated;
GRANT ALL ON public.eval_scenarios TO service_role;

ALTER TABLE public.eval_scenarios ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS eval_scenarios_user_idx
  ON public.eval_scenarios (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS eval_scenarios_suite_idx
  ON public.eval_scenarios (suite_id) WHERE suite_id IS NOT NULL;

DROP TRIGGER IF EXISTS eval_scenarios_updated_at ON public.eval_scenarios;
CREATE TRIGGER eval_scenarios_updated_at
  BEFORE UPDATE ON public.eval_scenarios
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 3. eval_runs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.eval_runs (
  id              UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         TEXT        NOT NULL REFERENCES public.profiles(clerk_user_id) ON DELETE CASCADE,
  suite_id        UUID        NOT NULL REFERENCES public.eval_suites(id) ON DELETE CASCADE,
  status          TEXT        NOT NULL DEFAULT 'pending',
  -- Summary stats cached for the list view: { total, passed, failed, p50_ms, p95_ms, cost_usd, tokens_in, tokens_out }
  summary         JSONB       NOT NULL DEFAULT '{}'::jsonb,
  error_message   TEXT,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.eval_runs DROP CONSTRAINT IF EXISTS eval_runs_status_check;
ALTER TABLE public.eval_runs ADD CONSTRAINT eval_runs_status_check
  CHECK (status IN ('pending','running','passed','failed','error','cancelled'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.eval_runs TO authenticated;
GRANT ALL ON public.eval_runs TO service_role;

ALTER TABLE public.eval_runs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS eval_runs_user_idx
  ON public.eval_runs (user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS eval_runs_suite_idx
  ON public.eval_runs (suite_id, started_at DESC);

-- ---------------------------------------------------------------------------
-- 4. eval_results
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.eval_results (
  id                UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           TEXT        NOT NULL REFERENCES public.profiles(clerk_user_id) ON DELETE CASCADE,
  run_id            UUID        NOT NULL REFERENCES public.eval_runs(id) ON DELETE CASCADE,
  scenario_id       UUID        REFERENCES public.eval_scenarios(id) ON DELETE SET NULL,
  scenario_name     TEXT        NOT NULL,
  passed            BOOLEAN     NOT NULL DEFAULT FALSE,
  verdict           TEXT,
  -- Per-grader scores: [{ grader:'llm_judge', score:0.92, rationale:'...' }]
  grader_scores     JSONB       NOT NULL DEFAULT '[]'::jsonb,
  response_text     TEXT,
  tokens_in         INTEGER     NOT NULL DEFAULT 0,
  tokens_out        INTEGER     NOT NULL DEFAULT 0,
  latency_ms        INTEGER     NOT NULL DEFAULT 0,
  cost_usd          NUMERIC(10,6),
  request_log_id    UUID        REFERENCES public.request_logs(id) ON DELETE SET NULL,
  error_message     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.eval_results TO authenticated;
GRANT ALL ON public.eval_results TO service_role;

ALTER TABLE public.eval_results ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS eval_results_run_idx
  ON public.eval_results (run_id, created_at);
CREATE INDEX IF NOT EXISTS eval_results_user_idx
  ON public.eval_results (user_id, created_at DESC);

-- Idempotency: at most one result per (run, scenario).
CREATE UNIQUE INDEX IF NOT EXISTS eval_results_unique_per_scenario
  ON public.eval_results (run_id, scenario_id) WHERE scenario_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 5. Feature flag on policy_settings — default OFF for backward compatibility.
-- ---------------------------------------------------------------------------
ALTER TABLE public.policy_settings
  ADD COLUMN IF NOT EXISTS enable_evaluation BOOLEAN NOT NULL DEFAULT FALSE;
