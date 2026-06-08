-- Incident -> regression-test capture — Wave 2.
-- Saved policy cases (captured from a request_log or authored) that can be
-- replayed through the engine to catch behavior regressions. Modeled on
-- alert_subscriptions.sql: RLS enabled deny-all (service-role only; all access
-- via the dashboard edge function), updated_at trigger, indexes, CHECKs.
--
-- IMPORTANT companion change (not in this migration): add "regression_tests"
-- to the scopedTables array in createTenantClient
-- (supabase/functions/_shared/anveguard.ts) so the dashboard's tenant-proxied
-- client auto-injects/auto-filters user_id. Without it, tenant isolation breaks.

CREATE TABLE IF NOT EXISTS public.regression_tests (
  id               UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          TEXT        NOT NULL REFERENCES public.profiles(clerk_user_id) ON DELETE CASCADE,
  name             TEXT        NOT NULL,
  -- Exact text fed to the engine: flattened prompt (input) or completion (output).
  input            TEXT        NOT NULL,
  direction        TEXT        NOT NULL DEFAULT 'input',
  expected_verdict TEXT        NOT NULL,
  -- Provenance: the request_log this was captured from. Nullable + ON DELETE
  -- SET NULL so the test survives log retention pruning.
  source_log_id    UUID        REFERENCES public.request_logs(id) ON DELETE SET NULL,
  enabled          BOOLEAN     NOT NULL DEFAULT TRUE,
  -- Last replay outcome, cached for the list view.
  last_run_verdict TEXT,
  last_run_passed  BOOLEAN,
  last_run_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

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

-- Reuse the shared updated_at trigger function (defined in earlier migrations).
DROP TRIGGER IF EXISTS regression_tests_updated_at ON public.regression_tests;
CREATE TRIGGER regression_tests_updated_at
  BEFORE UPDATE ON public.regression_tests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Defense in depth — RLS on, no user-facing policies (service-role only).
ALTER TABLE public.regression_tests ENABLE ROW LEVEL SECURITY;
