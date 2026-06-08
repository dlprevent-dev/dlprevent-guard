-- Triage-parity feature config — Wave 2.
-- Per-workspace toggles for tool-call governance, egress allowlist, deeper
-- tracing, and the model-assisted jailbreak classifier. All live on
-- policy_settings (per-user PK) and flow through the dashboard's
-- save_policy_settings typed whitelist. Column names match the engine's
-- PolicySettings fields exactly (supabase/functions/_shared/policy_engine.ts).
--
-- Every feature defaults OFF (or to a non-breaking value) so existing
-- workspaces see zero behavior change until they opt in — same convention as
-- enable_pii_detection / enable_metadata_only_logs.

ALTER TABLE public.policy_settings
  -- (1) Tool-call governance ------------------------------------------------
  ADD COLUMN IF NOT EXISTS enable_tool_governance        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tool_allowlist                text[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS tool_denylist                 text[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS tool_governance_action        text    NOT NULL DEFAULT 'block',
  -- Also scan assistant-emitted tool_calls in the response, not just request .tools
  ADD COLUMN IF NOT EXISTS tool_governance_scan_response boolean NOT NULL DEFAULT true,

  -- (2) Egress / outbound-domain allowlist ----------------------------------
  ADD COLUMN IF NOT EXISTS enable_egress_filter          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS egress_domain_allowlist       text[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS egress_domain_denylist        text[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS egress_block_private_ips      boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS egress_action                 text    NOT NULL DEFAULT 'flag',
  -- Scan model OUTPUT for URLs to disallowed domains (exfil), not just the upstream host
  ADD COLUMN IF NOT EXISTS egress_scan_output_urls       boolean NOT NULL DEFAULT true,

  -- (4) Deeper trace fields (master switch; trace columns added separately) --
  ADD COLUMN IF NOT EXISTS enable_deep_trace             boolean NOT NULL DEFAULT true,

  -- (5) Model-assisted jailbreak classifier ---------------------------------
  ADD COLUMN IF NOT EXISTS enable_model_jailbreak_classifier boolean NOT NULL DEFAULT false,
  -- Shadow = classify + log, never block (mirrors intent_shadow_mode)
  ADD COLUMN IF NOT EXISTS model_jailbreak_shadow_mode       boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS model_jailbreak_threshold         numeric NOT NULL DEFAULT 0.80,
  ADD COLUMN IF NOT EXISTS model_jailbreak_action            text    NOT NULL DEFAULT 'block';

-- Action enums — same 3-value vocabulary used by injection_action / behavioral_action.
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
