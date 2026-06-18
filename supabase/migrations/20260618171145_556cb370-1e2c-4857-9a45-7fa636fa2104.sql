
ALTER TABLE public.agent_targets DROP CONSTRAINT IF EXISTS agent_targets_api_type_check;
ALTER TABLE public.agent_targets ADD CONSTRAINT agent_targets_api_type_check CHECK (api_type IN ('openai','webhook','dual'));
ALTER TABLE public.agent_targets
  ADD COLUMN IF NOT EXISTS config_openai JSONB,
  ADD COLUMN IF NOT EXISTS config_webhook JSONB;
UPDATE public.agent_targets SET config_openai = config WHERE api_type = 'openai' AND config_openai IS NULL AND config IS NOT NULL;
UPDATE public.agent_targets SET config_webhook = config WHERE api_type = 'webhook' AND config_webhook IS NULL AND config IS NOT NULL;
ALTER TABLE public.eval_plans ADD COLUMN IF NOT EXISTS transport TEXT NOT NULL DEFAULT 'openai';
ALTER TABLE public.eval_plans DROP CONSTRAINT IF EXISTS eval_plans_transport_check;
ALTER TABLE public.eval_plans ADD CONSTRAINT eval_plans_transport_check CHECK (transport IN ('openai','webhook'));
