# AnveGuard — SOC 2 Type II evidence pack

*A control mapping you can hand to your auditor. Does not replace an audit — but cuts audit preparation from weeks to days.*

This document maps the controls AnveGuard ships in code to the **AICPA Trust Services Criteria** used in a SOC 2 Type II engagement. Anyone running AnveGuard in their own VPC (`deploy/docker-compose/`) inherits these controls — auditors can verify them directly in the open-source code, the migration files, and the audit log.

Last reviewed: 2026-06-09. Engine version: `main @ 1b8a1ce`.

## Scope

The "AnveGuard System" under audit includes:

- The detection engine (`supabase/functions/_shared/policy_engine.ts`)
- The proxy edge function (`supabase/functions/proxy/index.ts`)
- The dashboard edge function (`supabase/functions/dashboard/index.ts`)
- The alerts-fire edge function (`supabase/functions/alerts-fire/index.ts`)
- The Postgres schema under `supabase/migrations/`
- The React dashboard under `src/`

Out of scope: the upstream LLM provider (OpenAI, Anthropic, etc.) and the customer's own application that calls the proxy.

## Trust Services Criteria mapping

### Security (CC) — required for any SOC 2 report

| TSC | Control | AnveGuard evidence |
|---|---|---|
| **CC1.1** Org commitment to integrity | License + governance | `LICENSE` (Apache 2.0); public GitHub repo with signed commits + branch protection on `main` |
| **CC2.1** Internal communication of policies | Engine policies are code | Every detector lives in `policy_engine.ts` — auditable, diffable, version-controlled |
| **CC5.1** Logical access controls | RLS on every tenant table | All tenant-scoped tables (api_keys, request_logs, audit_logs, policy_*, regression_tests) have `ENABLE ROW LEVEL SECURITY` with deny-all-by-default — service-role only; tenant scoping is enforced in code via `createTenantClient` (`supabase/functions/_shared/anveguard.ts`) |
| **CC5.2** Logical access authentication | Clerk + JWT verification | Dashboard requires Clerk JWT verified server-side (`verifyClerkJwt`); proxy requires hashed `ag_live_` API key (SHA-256 lookup, never stored in plaintext) |
| **CC6.1** Restrict logical access | Per-key authorization | API keys bound to a workspace via `api_keys.user_id`; expired/revoked keys reject at the proxy with 401 |
| **CC6.6** Secure transmission | TLS everywhere | All function endpoints are HTTPS-only via Supabase; nginx (`deploy/docker-compose/nginx.conf`) terminates TLS on self-host |
| **CC6.7** Cryptographic key management | AES-GCM for stored provider keys | `KEY_ENCRYPTION_SECRET` derives an AES-GCM key (`encryptString` / `decryptString`); stored provider keys never returned to clients; key encryption happens server-side only |
| **CC7.1** System monitoring | Audit log on every action | `audit_logs` table records every config change (actor + action + target + metadata + timestamp); RLS deny-all; never updated, only inserted |
| **CC7.2** Anomaly detection | Drift + risk-trio + behavioral | `get_drift_report` (recent vs baseline window); `applyRiskTrio` agentic exfil pattern; `evaluateBehavioral` multi-turn analysis; configurable alerting via `alert_subscriptions` |
| **CC7.3** Incident response | Block + flag verdicts + alerts | Engine returns `block`/`flag`/`sanitize` verdicts at runtime; webhook alerts via `alerts-fire` function; incident-to-regression capture via `regression_tests` (replay confirmed in CI) |
| **CC8.1** Change management | GitOps + CI | All changes via PR on `github.com/ANVE-AI/prompt-sentinel-flow`; required CI checks (lint, typecheck, deno tests, vitest); merge to `main` triggers a deploy |
| **CC9.2** Vendor management | Documented dependencies | `package.json` + `pyproject.toml` lock files; npm audit + dependabot recommended for self-host |

### Availability (A) — optional, recommended

| TSC | Control | AnveGuard evidence |
|---|---|---|
| **A1.1** Capacity planning | Stateless edge runtime | Proxy + dashboard are stateless Deno functions — scale horizontally behind a load balancer |
| **A1.2** Backup and recovery | Postgres backups + migration replay | Migrations under `supabase/migrations/` are idempotent + version-controlled; standard Postgres backup procedures apply (point-in-time recovery on RDS/Cloud SQL) |
| **A1.3** Environmental protections | Inherited from underlying cloud | Customer's choice of AWS / GCP / Azure / on-prem provides physical + power redundancy |

### Confidentiality (C) — optional, recommended for SaaS

| TSC | Control | AnveGuard evidence |
|---|---|---|
| **C1.1** Identifying confidential info | PII detector | `detectPII` covers 11 categories (email, SSN, credit cards, IPs, API key shapes, OAuth tokens, …) — see `policy_engine.ts` |
| **C1.2** Disposal of confidential info | Configurable retention | `policy_settings.log_retention_days` and `audit_log_retention_days`; `prune_user_logs(_user_id)` and `prune_all_logs()` RPCs run scheduled deletion; sanitize verdicts replace PII with `[REDACTED:kind]` markers in stored prompts |

### Processing integrity (PI) — optional

| TSC | Control | AnveGuard evidence |
|---|---|---|
| **PI1.1** Input validation | Schema + CHECK constraints | Migrations under `supabase/migrations/20260522000000_feature_config_settings.sql` and `20260523000000_wave2_feature_config.sql` enforce CHECK constraints on every action enum (block/flag/sanitize), thresholds (0.5..0.99), and retention windows |
| **PI1.2** Processing logging | request_logs + verdict_layers | Every proxied call writes a `request_logs` row with `verdict_layers` (which detectors fired, in what order, with what reason) |
| **PI1.3** Output integrity | Verdict aggregation | `aggregate()` in `policy_engine.ts` is the single precedence function (block > sanitize > flag+strict > flag > allow) — auditable, tested (`policy_engine_attacks.test.ts` — 172 cases pass) |

### Privacy (P) — optional, recommended if processing PII

| TSC | Control | AnveGuard evidence |
|---|---|---|
| **P3.1** Personal info collection | Metadata-only logs mode | `policy_settings.enable_metadata_only_logs` strips message bodies from stored logs, keeping only hashes — useful for zero-knowledge / GDPR Art. 17 stances |
| **P5.1** Access and correction | Tenant-scoped dashboard | Workspace owners view + delete their own logs from `/dashboard/logs` |
| **P6.1** Notice of disclosures | Audit log on actor access | Every config change logged with actor identity in `audit_logs` |

## Suggested audit artifacts

When prepping a SOC 2 examination, generate these directly from your running stack:

```bash
# 1. Schema proof — every tenant-scoped table has RLS enabled
psql -c "select tablename, rowsecurity from pg_tables where schemaname='public' order by tablename;"

# 2. Audit log sample — last 30 days of admin actions
psql -c "select created_at, action, target_type from audit_logs where created_at > now() - interval '30 days' order by created_at desc limit 100;"

# 3. Retention policy proof — current retention windows per workspace
psql -c "select user_id, log_retention_days, audit_log_retention_days from policy_settings;"

# 4. Encrypted-at-rest proof — provider keys are never plaintext
psql -c "select id, name, length(provider_key_encrypted) > 0 as encrypted from api_keys limit 5;"

# 5. Engine test coverage — runs in CI on every commit
deno test --allow-env --allow-net --no-check supabase/functions/_shared/policy_engine_attacks.test.ts
# expected: 172 passed / 0 failed
```

Each command above produces an artifact your auditor can sign off on with no AnveGuard-side help required.

## What this document is NOT

This is not a SOC 2 report. Only an independent CPA firm can issue one after a formal Type II examination covering an audit period (typically 6–12 months). What this document does is **pre-stage the evidence** so the audit is short and cheap — most of the controls listed are already in the code, all the access logging is already on by default, and the schema is already designed to support the audit queries.

If you're going through a SOC 2 audit and want help, contact hello@citerlabs.com.

---

*Maintained by CiterLabs. AnveGuard is Apache 2.0.*
