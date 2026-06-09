-- Triage-parity deeper-trace + governance telemetry — Wave 2.
-- New dedicated, queryable columns on request_logs. We deliberately do NOT
-- touch the status CHECK constraint or add new status/verdict enum values —
-- all new signal rides in dedicated columns + verdict_layers, so a blocked
-- tool call reuses the existing 'blocked_input' path.

ALTER TABLE public.request_logs
  -- (4) Deeper trace fields
  ADD COLUMN IF NOT EXISTS request_id              text,
  ADD COLUMN IF NOT EXISTS upstream_latency_ms     integer,   -- provider time only (vs latency_ms = total)
  ADD COLUMN IF NOT EXISTS egress_domain           text,      -- resolved upstream host (always, when deep_trace on)
  ADD COLUMN IF NOT EXISTS egress_allowed          boolean,   -- NULL = egress filter not evaluated
  -- (1) Tool-call governance telemetry
  ADD COLUMN IF NOT EXISTS tools_requested         boolean,
  ADD COLUMN IF NOT EXISTS tools_names             text[],    -- tool names declared in the request
  ADD COLUMN IF NOT EXISTS tool_governance_verdict text,      -- 'allow'|'flag'|'block' or NULL when disabled
  ADD COLUMN IF NOT EXISTS response_tool_calls     text[];    -- tool names the assistant invoked

-- Partial indexes so the new "egress denied" / "look up by request id" views are cheap.
CREATE INDEX IF NOT EXISTS request_logs_egress_idx
  ON public.request_logs (user_id, egress_domain, created_at DESC)
  WHERE egress_domain IS NOT NULL;

CREATE INDEX IF NOT EXISTS request_logs_request_id_idx
  ON public.request_logs (request_id)
  WHERE request_id IS NOT NULL;
