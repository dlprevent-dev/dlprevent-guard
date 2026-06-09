# Deploy pending wave-1/wave-2 schema + verify

## Scope
The four migration files exist on disk but none have been applied to the Lovable Cloud database (verified: `policy_settings` has 0 of the 8 new columns; `regression_tests` table does not exist). Edge functions `proxy`, `dashboard`, `alerts-fire` already exist in the repo and Lovable redeploys them automatically when their source changes — no manual redeploy step is needed. The frontend likewise rebuilds when the user clicks **Publish → Update**; I cannot trigger a publish from here.

## Steps

1. **Apply the four migrations as one combined `supabase--migration` call**, in filename order:
   - `20260522000000_feature_config_settings.sql` — adds `enable_tool_governance`, `tool_allowlist`, `enable_egress_filter`, `enable_model_jailbreak_classifier`, `enable_trained_classifier`, `classifier_endpoint_url`, `enable_deep_trace` to `policy_settings`.
   - `20260522000100_request_logs_trace_fields.sql` — adds `request_id`, `tools_names`, `egress_domain`, `tool_governance_verdict`, `response_tool_calls` to `request_logs`.
   - `20260522000200_regression_tests.sql` — creates `public.regression_tests` (with GRANTs + RLS + policies + `updated_at` trigger).
   - `20260523000000_wave2_feature_config.sql` — adds `enable_cross_tenant_guard` to `policy_settings`.
   Single migration call so the user approves once. I will inline the SQL verbatim from the files.

2. **Verify with `supabase--read_query`** (after migration approval):
   - Query A: list the 8 new `policy_settings` columns — expect 8 rows.
   - Query B: `to_regclass('public.regression_tests')` — expect `true`.
   - Query C: list the 5 new `request_logs` columns — expect 5 rows.
   Paste raw output back to the user.

3. **Edge functions** (`proxy`, `dashboard`, `alerts-fire`): confirm they exist in `supabase/functions/` and report that Lovable-managed deploys happen automatically on source change — no version/status endpoint is exposed to me, so I'll spot-check by calling each via `supabase--curl_edge_functions` and report HTTP status.

4. **Frontend footer + homepage line**: I cannot trigger a publish. I'll grep the source to confirm the strings exist in code (`marketing-shell.tsx` already shows `© {year} AnveGuard by CiterLabs · Apache 2.0`), and tell the user to click **Publish → Update** so the published site picks them up. After they publish, a re-fetch of `guard.citerlabs.com` will show the new footer.

## Out of scope
- GitHub sync (Lovable ↔ GitHub is automatic and bidirectional; I don't drive it).
- Triggering a frontend production publish (user action via Publish button).
- Any code changes beyond the migrations.

## What you'll get back
- Migration approval prompt (one combined SQL).
- After approval: raw outputs of queries A/B/C, edge function curl statuses, and a note on the publish step.
