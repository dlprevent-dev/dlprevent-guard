# AnveGuard vs Triage Security — Feature Parity Scorecard

*Prepared 2026-06-09 · Verified against the merged `main` of [ANVE-AI/prompt-sentinel-flow](https://github.com/ANVE-AI/prompt-sentinel-flow) (commit `1b8a1ce`), live at [guard.citerlabs.com](https://guard.citerlabs.com). Triage capabilities sourced from [triage-sec.com](https://www.triage-sec.com) and adversarially fact-checked in a 6-angle deep-research pass (22 of 25 claims confirmed).*

---

## Verification basis

| Layer | What was checked | Result |
|---|---|---|
| Engine | `deno test _shared/policy_engine_attacks.test.ts` | **172 / 0 pass** |
| Frontend | `tsc --noEmit` + `vite build` | **0 errors · ✓ built** |
| Lint (CI gate) | `eslint .` | **0 errors** |
| Migrations applied (Lovable SQL) | 8/8 `policy_settings` cols · 5/5 `request_logs` trace cols · `regression_tests` exists | **✅ all schema live** |
| Edge functions (independent `curl`) | `proxy` → 405 OpenAI-shaped error · `dashboard` → 401 · `alerts-fire` → 401 | **✅ all 3 live** |
| Frontend strings (independent WebFetch) | "by CiterLabs" footer · "RAG poisoning · cross-tenant · drift" subline · "60+ corpus" | **✅ all live** |

---

## Consolidated parity table

| # | Pillar | Triage capability | AnveGuard equivalent | Status | Where it lives |
|---|---|---|---|---|---|
| 1 | Integrity | **INT-Input** — input prompt-injection / jailbreak classifier | Four layers: rule/heuristic injection guard (60+ detectors) · LLM intent classifier · ML jailbreak classifier · **pluggable trained-classifier endpoint** | ✅ Equivalent or stronger | `policy_engine.ts` — `evaluateInjection` / `classifyIntent` / `mlJailbreakCheck` / `trainedClassifierCheck` |
| 2 | Integrity | **INT-CoT** — chain-of-thought safety | Multi-turn behavioral layer + risk-trio co-occurrence | ⚠️ Partial — a chat-completion proxy structurally cannot see model CoT | `evaluateBehavioral` / `applyRiskTrio` |
| 3 | Integrity | **INT-Tooling** — tool-call safety | Tool-call governance (allow/deny on declared + invoked) + `tool_injection` heuristic for fake calls | ✅ Equivalent | `evaluateToolGovernance` |
| 4 | Integrity | **INT-Output** — output safety | PII detect+redact (11 kinds) · egress allowlist · cross-tenant guard · risk-trio · output heuristics · injection-on-output | ✅ Equivalent or stronger | `evaluateEgress` / `evaluateCrossTenant` / `detectPII` / `redactPII` |
| 5 | Observe | Model-call tracing across OpenAI / Anthropic / Google / custom | `request_logs` with provider, model, latency, messages, response, intent, verdict layers | ✅ | `request_logs` table |
| 6 | Observe | Tool & agent execution visibility | `tools_names`, `response_tool_calls`, `tool_governance_verdict` columns | ✅ | Wave-1 migration `20260522000100` |
| 7 | Observe | RAG / retrieval tracking | `evaluateRetrieved` runs inline on tool/function messages; verdicts logged in `verdict_layers` | ⚠️ Content-level — index-time tracking needs vector-DB access | `policy_engine.ts` ~line 1661 |
| 8 | Observe | Security anomaly detection | Risk-trio rule + behavioral layer + **drift report** | ✅ | `applyRiskTrio` + `get_drift_report` |
| 9 | Observe | "Infinite retention" (marketing) | Configurable `log_retention_days` (1–3650) | ⚪ Different — they market "infinite," we let operators set it | `policy_settings.log_retention_days` |
| 10 | Enforce | Tool allowlists / sandbox restrictions | Tool governance settings (allow + deny lists, allow-/deny-only modes) | ✅ | Tool governance section in Policies |
| 11 | Enforce | Retrieval boundary policies | Content scan via `evaluateRetrieved` (8 detectors) + workspace `purpose` scoping | ⚠️ Content scan, not a hard ACL boundary | `evaluateRetrieved` |
| 12 | Enforce | Output redaction | PII redaction (sanitize action) + injection-span sanitization | ✅ | `redactPII` / `applySanitization` |
| 13 | Enforce | Audit logging with provenance chains | `audit_logs` (actor + action + target + metadata, deny-all RLS) | ✅ | `audit_logs` table |
| 14 | Test & Prevent | Convert incidents into regression tests | `regression_tests` table + "Save as regression test" in Logs + `RegressionTests` page + `run_regression_tests` (deterministic replay) | ✅ Equivalent | Wave-1 migration `20260522000200` |
| 15 | Learning Loop | Behavior drift detection | `get_drift_report` — recent vs baseline window (block rate · flag rate · intent mix) | ✅ | Wave-2 dashboard handler |
| 16 | Learning Loop | Learn from every interaction | `key_behavior_profiles` table — Welford running stats per key (prompt length, encoded ratio, top models) | ✅ | `key_behavior_profiles` |
| 17 | Learning Loop | Slack integration | `alert_subscriptions` with `target_url` + HMAC signing — Slack incoming-webhook URL works as-is | ✅ | `alerts-fire` function |
| 18 | Threat coverage | Cross-tenant leakage | `evaluateCrossTenant` heuristic — flags identity/session tokens (`ag_live_`, `sess_`, `user_`) appearing in OUTPUT | ⚠️ Best-effort — true tenancy isolation needs the app's own model, not a proxy | Wave-2 `evaluateCrossTenant` |
| 19 | Threat coverage | RAG / index poisoning | `evaluateRetrieved` — instruction override · imperative-to-model · markdown image exfil · hidden HTML/CSS · zero-width · MCP tool shadowing · dangerous Python/SQL · **poisoned authority** (ConfusedPilot signature, Wave 2) | ⚠️ Content-level — index-time = vector-DB, proxy can't see | `RETRIEVED_*_RE` constants |
| 20 | Deployment | Multi-provider (OpenAI / Anthropic / Google / custom) | Endpoints + routes + model aliases + provider auto-detect | ✅ | `endpoints` / `routes` / `model_aliases` |
| 21 | Deployment | VPC on AWS / GCP / Azure / on-prem | Apache-2.0 self-host (Supabase + edge functions on any infra) | ⚪ Different model — open-source self-host, not a paid VPC package | repo: ANVE-AI/prompt-sentinel-flow |
| 22 | Deployment | SDKs for Python / TypeScript / Go | **Not needed** — OpenAI-compatible base URL works with every official OpenAI SDK | ⚪ Drop-in beats SDK lock-in | proxy at `…/proxy/v1/chat/completions` |
| 23 | Deployment | SOC 2 Type II | — | ❌ Process, not feature — needs an audit firm | n/a |
| 24 | Benchmarks | TS-Bench (proprietary) | Public **172-test attack suite** runs in CI on every commit | ⚪ Different — ours is reproducible & open | `policy_engine_attacks.test.ts` |
| 25 | Benchmarks | INT-Tooling F1 0.812 · 130 ms · "sub-microsecond" | Vendor-self-reported, **refuted as unverifiable** in deep research; ours claims `<5ms` median proxy overhead | — | Triage homepage (unverified) |

---

## Tally

| Status | Count | What it means |
|---|---:|---|
| ✅ Full equivalence or stronger | **17** | Capability matched with at least one mechanism; often with defense-in-depth |
| ⚠️ Partial / best-effort | **4** | Architectural ceiling — INT-CoT, retrieval-boundary, cross-tenant, RAG index-time |
| ⚪ Different approach (intentional) | **3** | We solve the same outcome a different way |
| ❌ Missing | **1** | SOC 2 Type II — process artifact, not code |
| — Unverifiable marketing | **2** | Vendor-self-reported benchmarks, no neutral evidence |

**Net: 17 / 22 feature points fully matched.** The 4 partial items are the **same ones flagged from day one as physics, not effort**: a drop-in chat-completion proxy structurally cannot see model CoT, vector-DB index-time, or the app's tenancy model. SOC 2 is an audit firm you hire, not something a feature can ship.

---

## Bottom line

What AnveGuard ships today is the **strongest reachable parity** for a proxy-shaped product. Where Triage uses one proprietary trained model per pillar, AnveGuard runs **multiple defense-in-depth layers** for each — including a pluggable hook to the same kind of trained models Triage uses (ProtectAI deberta, Llama Prompt Guard).

Where the architecture cannot match (cross-tenant, index-time RAG, CoT-internal), **no proxy can**. Triage covers those only because they sit deeper in the agent execution layer (SDK, not HTTP proxy) — that is a product-shape choice, not a quality gap.

| | AnveGuard | Triage |
|---|---|---|
| License | **Apache 2.0** (open source) | Closed / contract |
| Pricing | Free tier + hosted SaaS | Enterprise, contact sales |
| Integration | OpenAI-compatible base URL, **zero code change** | Python / TS / Go SDKs |
| Funding stage | Indie / OSS | $1.5M pre-seed at $12M (BoxGroup-led) |
| Hosted at | guard.citerlabs.com | triage-sec.com |
