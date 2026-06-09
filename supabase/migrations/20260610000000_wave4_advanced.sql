-- Wave 4: advanced capabilities — Triage doesn't have these.
-- All default-off / non-breaking except threat intel (default-on at "high"
-- severity, fail-open if the feed is unreachable).

ALTER TABLE public.policy_settings
  -- Threat Intelligence Feed
  ADD COLUMN IF NOT EXISTS enable_threat_intel       boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS threat_intel_min_severity text    NOT NULL DEFAULT 'high',
  ADD COLUMN IF NOT EXISTS threat_intel_action       text    NOT NULL DEFAULT 'block',
  ADD COLUMN IF NOT EXISTS threat_intel_feed_url     text,
  -- MCP Server Governance
  ADD COLUMN IF NOT EXISTS enable_mcp_governance     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mcp_server_allowlist      text[]  NOT NULL DEFAULT '{}',
  -- Map of "server_id/tool_name" -> sha256 hex (64 chars). Validated app-side.
  ADD COLUMN IF NOT EXISTS mcp_pinned_tool_hashes    jsonb   NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS mcp_governance_action     text    NOT NULL DEFAULT 'block',
  -- Cost-aware enforcement
  ADD COLUMN IF NOT EXISTS enable_cost_guard         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cost_budget_usd_per_request numeric(10, 6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_guard_action         text    NOT NULL DEFAULT 'block';

ALTER TABLE public.policy_settings DROP CONSTRAINT IF EXISTS policy_settings_ti_severity_check;
ALTER TABLE public.policy_settings ADD CONSTRAINT policy_settings_ti_severity_check
  CHECK (threat_intel_min_severity IN ('low','med','high','critical'));

ALTER TABLE public.policy_settings DROP CONSTRAINT IF EXISTS policy_settings_ti_action_check;
ALTER TABLE public.policy_settings ADD CONSTRAINT policy_settings_ti_action_check
  CHECK (threat_intel_action IN ('block','flag'));

ALTER TABLE public.policy_settings DROP CONSTRAINT IF EXISTS policy_settings_mcp_action_check;
ALTER TABLE public.policy_settings ADD CONSTRAINT policy_settings_mcp_action_check
  CHECK (mcp_governance_action IN ('block','flag'));

ALTER TABLE public.policy_settings DROP CONSTRAINT IF EXISTS policy_settings_cost_action_check;
ALTER TABLE public.policy_settings ADD CONSTRAINT policy_settings_cost_action_check
  CHECK (cost_guard_action IN ('block','flag'));

ALTER TABLE public.policy_settings DROP CONSTRAINT IF EXISTS policy_settings_cost_budget_check;
ALTER TABLE public.policy_settings ADD CONSTRAINT policy_settings_cost_budget_check
  CHECK (cost_budget_usd_per_request >= 0 AND cost_budget_usd_per_request <= 100);
