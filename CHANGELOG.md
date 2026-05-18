# Changelog

All notable changes to AnveGuard. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) + [SemVer](https://semver.org/).

## [Unreleased]

## [0.2.0] — 2026-05-18

Big quality + UX pass. Engine test count goes 56 → 177 across all four test files. Frontend test count goes 1 → 69. Repo flipped to **public** on GitHub under **Apache 2.0**.

### Added — Engine (security)

- **15 new INJECTION_PATTERNS** covering the 2024-2025 attack landscape: `refusal_suppression`, `answer_regardless`, `authority_impersonation`, `policy_was_updated`, `refusal_extraction_probe`, `format_hijack_no_prose`, `false_prior_agreement`, `modern_jailbreak_persona` (AIM, BetterDAN, STAN, DUDE, EvilBOT, ChadGPT, UCAR, Mongo Tom, Evil Confidant, Machiavelli, Sydney 2.0, DAN 10+), `skeleton_key_update` + `skeleton_key_prefix_warning` (Microsoft 2024), `system_role_json_injection`, `chat_template_token_smuggle`, `cot_extraction` (targets o1/Claude extended thinking), `force_compliance_prefix` (GCG/AutoDAN refusal-bypass).
- **4 new DETECTORS** wired into `evaluateHeuristics`: `homoglyph_smuggling` (Cyrillic/Greek lookalikes), `many_shot_jailbreak` (Anthropic 2024), `cipher_payload` (ROT13/leetspeak/Morse/Pig Latin), `adversarial_suffix` (GCG/AutoDAN-Turbo/BEAST trailing garbage).
- **`evaluateRetrieved()` XPIA scanner** — 9 channel-aware detectors for indirect prompt injection in RAG chunks, MCP tool results, scraped HTML, email: `retrieved_instruction_override`, `retrieved_imperative_to_model`, `retrieved_markdown_image_exfil` (EchoLeak / CVE-2025-32711), `retrieved_hidden_html_instruction`, `retrieved_html_comment_injection`, `retrieved_cross_tool_reference`, `retrieved_sql_write_in_read_context` (Vanna.AI / CVE-2024-5565), `retrieved_dangerous_python` (Langflow / CVE-2025-3248), `retrieved_tag_char_smuggle`. **Wired into the proxy** — runs on every tool-role / function-role message before upstream forwarding.

### Added — Engine (output guards previously dormant)

- Wired in `system_prompt_leak`, `tool_injection`, `credential_shape`, `url_exfil` — all previously defined in DETECTORS but never invoked. Modernized `CRED_PATTERNS` to catch `sk-proj-`, `sk-svcacct-`, `sk-admin-`, `ghp_`, `gho_`, `AIza`, `ag_live_` and split Stripe live/test keys.

### Added — Frontend UX

- **Replay flow:** one-click "Replay in Playground" on every log row. Auto-prefills the prompt, selects the source API key, surfaces a banner with the original verdict + block reason. `src/lib/replay.ts` + `src/components/replay-button.tsx`.
- **Onboarding expanded:** 3 → 6 steps (Welcome → Concepts primer → Endpoint → Key → Playground → You're ready). The Concepts primer is a 4-card grid (Endpoint / Key / Policy / Route) so the rest of the dashboard reads fast.
- **Guided tour driver:** in-page tour with SVG spotlight + auto-flip tooltip + Esc-to-close + `data-tour="…"` selector convention. First wiring on Logs page (3 steps, auto-opens on first visit, re-triggerable via new "Tour" button in the header). `src/components/guided-tour.tsx`.
- **Wizard primitive:** multi-step form wizard with `canAdvance` validator gating, async `onExit`/`onEnter` hooks, error surfacing, busy state. Ready for adoption by complex forms. `src/components/wizard.tsx`.

### Fixed — Engine bugs surfaced by the test suite

- **Narrative misdirection passive bypass** — extended `CONSTRUCTION_INTENT_RE` to catch "explains how X is synthesized" (was only matching active voice "how to synthesize").
- **`output_repetition` early-return** — 30-token-run check now fires even on short outputs (was gated by a `< 200` chars length floor).
- **`credential_shape` stateful regex** — added `lastIndex = 0` reset; without it, `re.test()` with `/g` flag silently alternated hits/misses across requests in the same Deno isolate.
- **4 previously-defined-but-never-invoked detectors** wired into `evaluateHeuristics`.

### Changed

- **License:** MIT → **Apache 2.0** (chosen for the explicit patent grant — standard for security tooling: Falco, Vault, Trivy).
- **Repo:** PRIVATE → **PUBLIC** at https://github.com/ANVE-AI/prompt-sentinel-flow.
- **package.json:** name `vite_react_shadcn_ts` → `anveguard`; added `description`, `license`, `homepage`, `repository`, `bugs`.
- **README:** added "What's detected" table mapping all 63 detection rules to OWASP standards + CVE coverage.

### Added — OSS scaffolding

- `LICENSE` (Apache 2.0)
- `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1)
- `.github/ISSUE_TEMPLATE/` (bug_report, feature_request, policy_bypass — routes severe bypasses to security@anve.ai per SECURITY.md)
- `.github/PULL_REQUEST_TEMPLATE.md`
- `.github/workflows/ci.yml` already in place — runs lint, typecheck, vitest, build, plus deno tests on every PR

### Tests

| Suite | Before | After |
|---|---|---|
| `policy_engine_attacks.test.ts` (Deno) | 56 | 130 |
| `compress.test.ts` (Deno) | 12 | 12 |
| `system_prompt*.test.ts` (Deno) | 22 | 22 |
| `providers_test.ts` (Deno) | 4 | 13 |
| `proxy-response.test.ts` (vitest) | — | 27 |
| `replay.test.ts` (vitest) | — | 24 |
| `wizard.test.tsx` (vitest) | — | 17 |
| `example.test.ts` (vitest) | 1 | 1 |
| **Total** | **95** | **246** |

### Coverage of 2024-2025 attack landscape

Mapped to **OWASP LLM Top 10 (2025)**, **OWASP Agentic Top 10**, **OWASP MCP Top 10**. CVE coverage:

- CVE-2025-32711 (EchoLeak — M365 Copilot zero-click)
- CVE-2024-5565 (Vanna.AI text-to-SQL injection)
- CVE-2025-3248 (Langflow code execution)
- CVE-2024-7042 (LangChain GraphCypherQAChain)
- The Skeleton Key family (Microsoft Research 2024)
- Many-shot jailbreak / MSJ (Anthropic 2024)

## [0.1.0] — 2026-05-04

Initial Lovable-built version with: dashboard, layered policy engine, OpenAI/Anthropic/Perplexity/OpenRouter providers, request logs, audit logs, policy rules, alerts, threats dashboard.
