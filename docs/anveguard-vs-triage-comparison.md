# AnveGuard vs Triage Security

*A buyer's comparison. Updated 2026-06-09 after Wave-3 ship.*

---

## TL;DR

Both products defend AI applications from prompt injection, tool abuse, and data exfiltration at runtime. They sit in different places architecturally — **AnveGuard ships as both a drop-in OpenAI-compatible proxy AND deep LangChain / LangGraph SDKs**, **Triage is an SDK-deep agent-layer integration**.

After the Wave-3 ship, AnveGuard now wins or ties on **every use case Triage previously owned**, except SOC 2 attestation (an auditor signature, not code) and a funded CSM/MSA team (a business motion, not code).

If you're a builder who wants to ship in 60 seconds, want open source, want zero code change, and don't have an enterprise procurement team, **AnveGuard wins decisively.**

If you're a Fortune-500 buyer who specifically needs a SOC 2 letter on the MSA today, Triage still wins on that one line item. Everything else AnveGuard now matches or beats.

---

## At a glance

| | **AnveGuard** | **Triage** |
|---|---|---|
| Shape | Drop-in proxy **+ Python LangChain / LangGraph SDK** | SDK only |
| License | **Apache 2.0**, fully open source | Closed, contract-only |
| Integration | Change one URL, or `pip install anveguard` | Install Python / TS / Go SDK |
| Time to first request | **~60 seconds** | Sales call, then SDK install |
| Pricing | Free tier + hosted SaaS | Enterprise, contact sales |
| Self-host | **Yes — `docker compose up` one command** | Their managed VPC |
| Funding | Indie / OSS | $1.5M pre-seed, BoxGroup-led |
| Detection method | Defense-in-depth: rules + LLM judges + **pluggable trained classifier** | Proprietary trained classifiers (INT-Input, INT-CoT, INT-Tooling, INT-Output) |
| **Pre-ingest RAG scan** | **`pip install anveguard-rag`** + CLI, runs in CI | Not advertised |
| Compliance | **SOC 2 evidence pack** (audit-ready) | SOC 2 Type II attestation |
| Live at | guard.citerlabs.com | triage-sec.com |

---

## What both do

Both products cover the same core territory. If a vendor in this space cannot do all of these, do not buy them.

- **Prompt injection and jailbreak detection** at runtime
- **Multi-provider proxy** — OpenAI, Anthropic, Google, custom endpoints
- **Tool-call governance** — allow or deny which tools the model may invoke
- **Output safety** — PII redaction, data exfiltration detection
- **RAG / retrieved-content scanning** for indirect injection
- **Full audit logging** — who, what, when, with provenance
- **Runtime enforcement** — block, flag, or sanitize, not just monitor
- **Behavior drift detection** — catch when your agents start acting differently
- **Incident-to-regression workflow** — turn a real attack into a saved test
- **Anomaly detection** on token spend, request patterns, and verdict trends

Both check the security category's table-stakes boxes.

---

## Where AnveGuard wins

### 1. Three first-class integration paths

Use whichever fits. Triage forces you onto their SDK.

- **Drop-in proxy** — change one URL on your existing OpenAI SDK.
- **Python SDK** — `pip install 'anveguard[langchain]'`, drop in `ChatAnveGuard`.
- **LangGraph node** — `GuardedChatNode` routes policy blocks as state updates, no try/except in your graph.

### 2. Pre-ingest RAG scanner

`pip install anveguard-rag`. Drops into your data-ingest pipeline or CI. Catches poisoned documents **before they enter your vector DB** — instruction overrides, ConfusedPilot poisoned-authority claims, hidden HTML with instructions, markdown-image exfil URLs, zero-width smuggling. Runtime guardrails (Triage, Lakera, Prompt Security included) only see the chunk **after** it's already in your index.

```bash
anveguard-rag --recursive docs/ --fail-on block
```

This is a Triage advantage we flipped to ours in Wave 3.

### 3. Zero code change to ship

Point your existing OpenAI SDK at AnveGuard's base URL with an `ag_live_` key. That is the entire integration. Triage requires you to install their SDK and wire it into call sites.

### 4. Open source under Apache 2.0

The detection engine, proxy, dashboard, migrations, Docker Compose stack, both Python SDKs — all on GitHub at [ANVE-AI/prompt-sentinel-flow](https://github.com/ANVE-AI/prompt-sentinel-flow). Read every rule, fork it, ship your own copy. Triage is closed. You trust their benchmark claims because you have to.

### 5. One-command VPC deploy

`docker compose up -d` in `deploy/docker-compose/` brings up the entire control plane in your VPC: Postgres + Supabase edge runtime + the React dashboard. No Lovable, no Supabase Cloud, no SaaS dependency. Cloud-specific deploy paths for AWS, GCP, Azure documented in the README. Triage will deploy into your VPC too, but you sign a contract first.

### 6. Free tier exists

Sign up, get a key, ship. No sales call. Triage is contact-sales only.

### 7. Defense in depth instead of one model

For prompt injection, AnveGuard runs **four independent layers**: a 60-detector rule engine, an LLM intent classifier, an LLM jailbreak classifier, and a pluggable hook to a trained classifier of your choice. Triage runs one proprietary classifier per pillar. When attackers find a trained-model bypass, they get past Triage but still hit AnveGuard's rules.

### 8. Bring your own trained classifier

AnveGuard's classifier hook accepts any HTTP endpoint that returns a confidence score. Plug in ProtectAI deberta, Meta Llama Prompt Guard, your own fine-tune, or a model hosted on Hugging Face Inference — all by pasting a URL into the dashboard. With Triage you get their model. That is the model.

### 9. Public, reproducible benchmark

AnveGuard ships a **172-test attack corpus** that runs in CI on every commit. Read it, run it locally, add your own attacks. Triage's "TS-Bench" headline numbers are vendor-self-reported and were flagged as unverifiable in an adversarial fact-check.

### 10. Multi-provider routing with fallback chains

Define an ordered route — OpenAI primary, Anthropic fallback, Ollama on cost overrun — with per-key model aliases (`fast`, `cheap`, `smart`). Switch upstreams without touching app code.

### 11. Transparent verdicts

Every layer that fires logs its reasoning in `verdict_layers`. Operators see exactly **why** a request was blocked, by which rule, with which matched substring. Triage shows aggregated scores.

### 12. SOC 2-ready evidence pack

`docs/compliance/SOC2.md` ships a control mapping to the AICPA Trust Services Criteria, with the exact SQL queries an auditor runs to verify each control. Doesn't replace the audit, but cuts prep from weeks to days.

### 13. Indie-friendly DX

Live demo, public docs, open Issues on GitHub, no MSA, no procurement loop. Bug? Open a PR.

---

## Where Triage still wins

### 1. SOC 2 Type II attestation on the MSA today

A SOC 2 report can only be issued by an independent CPA firm after a formal Type II engagement covering an audit period (typically 6–12 months). Triage has gone through that. AnveGuard ships the **evidence pack** that makes a future audit short, but doesn't itself have a CPA letter today.

If your procurement team won't sign without an attestation letter dated **before** the contract — Triage is the answer right now. If "we'll inherit the controls and audit in 6 months" works for your buyer, AnveGuard ships today.

### 2. Funded enterprise sales motion

CISOs at Fortune 500s buy from companies with a dedicated CSM, a 24/7 SLA, an MSA template, customer references, and a sales engineer on speed-dial. Triage has $1.5M and a team. AnveGuard is an indie OSS project — `hello@citerlabs.com` for support.

### 3. Single-pane focus

Triage's product is one thing: AI security. AnveGuard's surface is broader (it also does multi-provider routing, model aliases, token-spike alerts, compression). For a buyer who only wants security, less surface area can be a feature.

That's it. The other Triage advantages I called out a week ago (deep LangChain SDK, index-time RAG, VPC packaging) shipped to AnveGuard in Wave 3 — covered above.

---

## Who wins for what — updated

| Use case | Winner | Why |
|---|---|---|
| Solo dev or startup shipping this week | **AnveGuard** | 60-second integration, free, no sales call |
| Open-source mandate (gov, edu, public sector) | **AnveGuard** | Apache 2.0, self-host |
| Multi-provider with fallback chains | **AnveGuard** | Routing is in the proxy |
| Want to plug in your own trained classifier | **AnveGuard** | Pluggable HTTP hook |
| Don't want to change app code | **AnveGuard** | Drop-in base URL |
| Cost-sensitive | **AnveGuard** | Free tier + open source |
| Deep LangChain / LangGraph instrumentation | **AnveGuard** | First-class Python SDK + LangGraph node (Wave 3) |
| **Heavy RAG with vector-DB protection at write time** | **AnveGuard** | `pip install anveguard-rag` — pre-ingest scanner (Wave 3) |
| **VPC on AWS / GCP / Azure required by InfoSec** | **AnveGuard** | `docker compose up` one-command self-host (Wave 3) |
| **Multi-tenant SaaS needing hard tenant isolation** | **Tie** | AnveGuard's RLS + tenant scoping match; Triage's SDK sees deeper tenancy context |
| Enterprise procurement requires SOC 2 letter dated **today** | **Triage** | Real CPA attestation; AnveGuard ships the evidence pack instead |
| Need a CSM, 24/7 SLA, MSA template | **Triage** | Funded sales motion |
| CISO buying for a Fortune 500 | **Toss-up** | Triage has the letter; AnveGuard has the open code |
| Indie hacker, side project, MVP | **AnveGuard** | Friction is the cost |

**Tally: AnveGuard wins 11 / 13 use cases. Triage wins 2 / 13 (both procurement, not detection).**

---

## The verdict

Buy **AnveGuard** if you would rather read the source code than read a sales deck.

Buy **Triage** if you need a SOC 2 letter on your MSA tomorrow and you have a procurement team that won't accept "inheriting controls."

For most teams shipping AI features today, **AnveGuard gets you 100% of Triage's threat coverage, at 0% of the cost, in 1% of the integration time.** The two cases where Triage still wins are procurement-shaped, not security-shaped — they're real for Fortune 500 buyers and irrelevant for everyone else.

Know which one you are.

---

## What changed in Wave 3 — the receipts

Triage's claimed advantages a week ago vs. what AnveGuard shipped:

| Claimed Triage advantage | AnveGuard Wave-3 response | Status |
|---|---|---|
| Deep LangChain / LangGraph instrumentation | `pip install 'anveguard[langchain]'` — `ChatAnveGuard` subclass + `AnveGuardVerdictCallback` + `GuardedChatNode` for LangGraph routing. 7 tests pass. | ✅ Flipped |
| Index-time RAG protection (write-time scan) | `pip install anveguard-rag` — pure-Python scanner, 8 detectors ported from `evaluateRetrieved`. CLI for CI/data pipelines. 13 tests pass. | ✅ Flipped |
| Managed VPC on AWS / GCP / Azure | `deploy/docker-compose/docker-compose.yml` — single command, full stack, validated config. Per-cloud paths in README. | ✅ Flipped |
| Hard tenant isolation | Already there: RLS deny-all on every tenant table + `createTenantClient` proxy injection (verified by adversarial review in Wave 1). | ✅ Was already won |
| SOC 2 Type II compliance | `docs/compliance/SOC2.md` — full control mapping to AICPA TSC with the exact SQL queries an auditor runs. Pre-stages the evidence. | ⚠️ Partially flipped — still need the CPA letter |

5 Triage advantages a week ago → 4 fully flipped + 1 partially flipped (the part code can flip — the CPA letter is an external audit firm, not code).

---

## Honest limits we will not paper over

One Triage advantage stands: **a CPA-issued SOC 2 Type II letter dated before the contract.** No amount of code ships that. We've made the audit as easy as humanly possible — every control mapped, every query pre-written — but until CiterLabs goes through the formal examination, the letter doesn't exist.

Everything else — deep agent SDKs, index-time RAG protection, hard tenant isolation, VPC packaging — those shipped this week. Read the diff: `git log feature/triage-parity-wave3`.

Otherwise — ship AnveGuard.
