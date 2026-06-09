-- 20260522000000_feature_config_settings.sql
ALTER TABLE public.policy_settings
  ADD COLUMN IF NOT EXISTS enable_tool_governance        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tool_allowlist                text[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS tool_denylist                 text[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS tool_governance_action        text    NOT NULL DEFAULT 'block',
  ADD COLUMN IF NOT EXISTS tool_governance_scan_response boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS enable_egress_filter          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS egress_domain_allowlist       text[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS egress_domain_denylist        text[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS egress_block_private_ips      boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS egress_action                 text    NOT NULL DEFAULT 'flag',
  ADD COLUMN IF NOT EXISTS egress_scan_output_urls       boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS enable_deep_trace             boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS enable_model_jailbreak_classifier boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS model_jailbreak_shadow_mode       boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS model_jailbreak_threshold         numeric NOT NULL DEFAULT 0.80,
  ADD COLUMN IF NOT EXISTS model_jailbreak_action            text    NOT NULL DEFAULT 'block';

ALTER TABLE public.policy_settings DROP CONSTRAINT IF EXISTS policy_settings_tool_gov_action_check;
ALTER TABLE public.policy_settings ADD CONSTRAINT policy_settings_tool_gov_action_check
  CHECK (tool_governance_action IN ('block','flag','sanitize'));

ALTER TABLE public.policy_settings DROP CONSTRAINT IF EXISTS policy_settings_egress_action_check;
ALTER TABLE public.policy_settings ADD CONSTRAINT policy_settings_egress_action_check
  CHECK (egress_action IN ('block','flag','sanitize'));

ALTER TABLE public.policy_settings DROP CONSTRAINT IF EXISTS policy_settings_mjc_action_check;
ALTER TABLE public.policy_settings ADD CONSTRAINT policy_settings_mjc_action_check
  CHECK (model_jailbreak_action IN ('block','flag'));

ALTER TABLE public.policy_settings DROP CONSTRAINT IF EXISTS policy_settings_mjc_threshold_check;
ALTER TABLE public.policy_settings ADD CONSTRAINT policy_settings_mjc_threshold_check
  CHECK (model_jailbreak_threshold >= 0.5 AND model_jailbreak_threshold <= 0.99);

-- 20260522000100_request_logs_trace_fields.sql
ALTER TABLE public.request_logs
  ADD COLUMN IF NOT EXISTS request_id              text,
  ADD COLUMN IF NOT EXISTS upstream_latency_ms     integer,
  ADD COLUMN IF NOT EXISTS egress_domain           text,
  ADD COLUMN IF NOT EXISTS egress_allowed          boolean,
  ADD COLUMN IF NOT EXISTS tools_requested         boolean,
  ADD COLUMN IF NOT EXISTS tools_names             text[],
  ADD COLUMN IF NOT EXISTS tool_governance_verdict text,
  ADD COLUMN IF NOT EXISTS response_tool_calls     text[];

CREATE INDEX IF NOT EXISTS request_logs_egress_idx
  ON public.request_logs (user_id, egress_domain, created_at DESC)
  WHERE egress_domain IS NOT NULL;

CREATE INDEX IF NOT EXISTS request_logs_request_id_idx
  ON public.request_logs (request_id)
  WHERE request_id IS NOT NULL;

-- 20260522000200_regression_tests.sql
CREATE TABLE IF NOT EXISTS public.regression_tests (
  id               UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          TEXT        NOT NULL REFERENCES public.profiles(clerk_user_id) ON DELETE CASCADE,
  name             TEXT        NOT NULL,
  input            TEXT        NOT NULL,
  direction        TEXT        NOT NULL DEFAULT 'input',
  expected_verdict TEXT        NOT NULL,
  source_log_id    UUID        REFERENCES public.request_logs(id) ON DELETE SET NULL,
  enabled          BOOLEAN     NOT NULL DEFAULT TRUE,
  last_run_verdict TEXT,
  last_run_passed  BOOLEAN,
  last_run_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.regression_tests TO service_role;

ALTER TABLE public.regression_tests DROP CONSTRAINT IF EXISTS regression_tests_direction_check;
ALTER TABLE public.regression_tests ADD CONSTRAINT regression_tests_direction_check
  CHECK (direction IN ('input','output'));

ALTER TABLE public.regression_tests DROP CONSTRAINT IF EXISTS regression_tests_expected_check;
ALTER TABLE public.regression_tests ADD CONSTRAINT regression_tests_expected_check
  CHECK (expected_verdict IN ('allow','flag','block','sanitize'));

CREATE INDEX IF NOT EXISTS regression_tests_user_idx
  ON public.regression_tests (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS regression_tests_enabled_idx
  ON public.regression_tests (user_id, enabled) WHERE enabled = TRUE;

DROP TRIGGER IF EXISTS regression_tests_updated_at ON public.regression_tests;
CREATE TRIGGER regression_tests_updated_at
  BEFORE UPDATE ON public.regression_tests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.regression_tests ENABLE ROW LEVEL SECURITY;

-- 20260523000000_wave2_feature_config.sql
ALTER TABLE public.policy_settings
  ADD COLUMN IF NOT EXISTS enable_trained_classifier boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS classifier_endpoint_url   text,
  ADD COLUMN IF NOT EXISTS classifier_api_key        text,
  ADD COLUMN IF NOT EXISTS classifier_threshold      numeric NOT NULL DEFAULT 0.80,
  ADD COLUMN IF NOT EXISTS classifier_action         text    NOT NULL DEFAULT 'block',
  ADD COLUMN IF NOT EXISTS classifier_shadow_mode    boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS enable_cross_tenant_guard boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cross_tenant_action       text    NOT NULL DEFAULT 'flag';

ALTER TABLE public.policy_settings DROP CONSTRAINT IF EXISTS policy_settings_classifier_action_check;
ALTER TABLE public.policy_settings ADD CONSTRAINT policy_settings_classifier_action_check
  CHECK (classifier_action IN ('block','flag'));

ALTER TABLE public.policy_settings DROP CONSTRAINT IF EXISTS policy_settings_cross_tenant_action_check;
ALTER TABLE public.policy_settings ADD CONSTRAINT policy_settings_cross_tenant_action_check
  CHECK (cross_tenant_action IN ('block','flag'));

ALTER TABLE public.policy_settings DROP CONSTRAINT IF EXISTS policy_settings_classifier_threshold_check;
ALTER TABLE public.policy_settings ADD CONSTRAINT policy_settings_classifier_threshold_check
  CHECK (classifier_threshold >= 0.5 AND classifier_threshold <= 0.99);