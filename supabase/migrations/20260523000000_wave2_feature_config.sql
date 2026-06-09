-- Wave-2 feature config: trained-classifier endpoint + cross-tenant guard.
-- Column names match the engine's PolicySettings fields. All default OFF /
-- non-breaking, persisted through the dashboard save_policy_settings whitelist.

ALTER TABLE public.policy_settings
  -- Trained-classifier endpoint (pluggable)
  ADD COLUMN IF NOT EXISTS enable_trained_classifier boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS classifier_endpoint_url   text,
  ADD COLUMN IF NOT EXISTS classifier_api_key        text,
  ADD COLUMN IF NOT EXISTS classifier_threshold      numeric NOT NULL DEFAULT 0.80,
  ADD COLUMN IF NOT EXISTS classifier_action         text    NOT NULL DEFAULT 'block',
  ADD COLUMN IF NOT EXISTS classifier_shadow_mode    boolean NOT NULL DEFAULT true,
  -- Cross-tenant leakage heuristic
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
