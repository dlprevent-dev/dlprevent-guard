
CREATE TABLE IF NOT EXISTS public.agent_targets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.profiles(clerk_user_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  api_type TEXT NOT NULL DEFAULT 'openai',
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  auth_token TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.agent_targets DROP CONSTRAINT IF EXISTS agent_targets_api_type_check;
ALTER TABLE public.agent_targets ADD CONSTRAINT agent_targets_api_type_check CHECK (api_type IN ('openai','webhook'));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_targets TO authenticated;
GRANT ALL ON public.agent_targets TO service_role;
ALTER TABLE public.agent_targets ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS agent_targets_user_idx ON public.agent_targets (user_id, created_at DESC);
DROP TRIGGER IF EXISTS agent_targets_updated_at ON public.agent_targets;
CREATE TRIGGER agent_targets_updated_at BEFORE UPDATE ON public.agent_targets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.eval_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.profiles(clerk_user_id) ON DELETE CASCADE,
  agent_target_id UUID REFERENCES public.agent_targets(id) ON DELETE SET NULL,
  name TEXT NOT NULL DEFAULT 'Untitled plan',
  objectives JSONB NOT NULL DEFAULT '{}'::jsonb,
  question_count INT NOT NULL DEFAULT 200,
  weights JSONB NOT NULL DEFAULT '{"faithfulness":1,"relevance":1,"safety":1,"robustness":1}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft',
  summary JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.eval_plans DROP CONSTRAINT IF EXISTS eval_plans_status_check;
ALTER TABLE public.eval_plans ADD CONSTRAINT eval_plans_status_check CHECK (status IN ('draft','generating','pending_review','approved','archived'));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.eval_plans TO authenticated;
GRANT ALL ON public.eval_plans TO service_role;
ALTER TABLE public.eval_plans ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS eval_plans_user_idx ON public.eval_plans (user_id, created_at DESC);
DROP TRIGGER IF EXISTS eval_plans_updated_at ON public.eval_plans;
CREATE TRIGGER eval_plans_updated_at BEFORE UPDATE ON public.eval_plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.eval_scenarios
  ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES public.eval_plans(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS author_judge TEXT,
  ADD COLUMN IF NOT EXISTS approved BOOLEAN NOT NULL DEFAULT TRUE;
CREATE INDEX IF NOT EXISTS eval_scenarios_plan_idx ON public.eval_scenarios (plan_id) WHERE plan_id IS NOT NULL;

ALTER TABLE public.eval_runs
  ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES public.eval_plans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS agent_target_id UUID REFERENCES public.agent_targets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS progress INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS flagged_count INT NOT NULL DEFAULT 0;

ALTER TABLE public.eval_results
  ADD COLUMN IF NOT EXISTS judge_a_score NUMERIC,
  ADD COLUMN IF NOT EXISTS judge_b_score NUMERIC,
  ADD COLUMN IF NOT EXISTS judge_a_rationale TEXT,
  ADD COLUMN IF NOT EXISTS judge_b_rationale TEXT,
  ADD COLUMN IF NOT EXISTS confidence NUMERIC,
  ADD COLUMN IF NOT EXISTS disagreement NUMERIC;
