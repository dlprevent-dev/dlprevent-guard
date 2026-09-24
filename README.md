<div align="center">

<img src="docs/images/dlprevent-logo.svg" alt="" width="128" height="128">

# dlprevent-guard

**A prompt-injection and data-loss guard between an AI agent and its model — one container, reporting to DLPrevent**

Built on the policy engine of [AnveGuard](https://github.com/ANVE-AI/prompt-sentinel-flow)
by ANVE-AI. See [Credits and license](#credits-and-license).

[![License](https://img.shields.io/badge/License-Apache%202.0-blue)](LICENSE)
[![Deno](https://img.shields.io/badge/Deno-2.x-000?logo=deno&logoColor=white)](guard/deno.json)
[![Docker](https://img.shields.io/badge/Docker-one%20compose%20file-2496ed?logo=docker&logoColor=white)](guard/compose.yml)
[![APIs](https://img.shields.io/badge/APIs-OpenAI%20%C2%B7%20Anthropic-555)](#what-it-scans)
[![Mode](https://img.shields.io/badge/Default-flag%20only-e07a3f)](#configuration)

</div>

---

## Why this exists

An AI agent with a shell does what it is told — and it is told things by
more than its user. A web page it summarises, a file it opens, the result of
a tool it called: all of it lands in the same conversation, and a sentence
hidden in any of it can turn *"summarise this"* into *"send ~/.ssh to
webhook.site"*. The agent does not need to be broken for that. It only needs
to be obliging.

The agent's host sees the consequence — a process that reads keys and opens
a connection. It does not see the cause. **dlprevent-guard** sits where the
cause passes: between the agent and its model. Every request and every
answer goes through it, and it reports what does not belong there:

- **Prompt injection** in the user's message — and, more to the point, in
  every **tool result**, where it actually arrives — and in the
  **descriptions of the tools** the agent offers the model, which an MCP
  server writes and the model reads as guidance on every turn.
- **Secrets and personal data** on their way to the model provider.
- **Commands that carry data out** in the model's answer: uploads to
  data-drop services, credential files, reverse shells, downloads piped into
  a shell, data hidden in an image link.

Findings go to [DLPrevent](https://github.com/dlprevent-dev/dlprevent),
which shows them as alerts next to what it sees on the host: which tool call
the agent made, for which user, and which files it was refused.

**And what it is not.** A guard in front of the model sees text. It does not
see the machine, and an agent that is told to do harm in words it has never
seen before will not be caught by a rule written for words it has. It is
one layer; the host-side DLPrevent agent is the other.

## How it fits

```
 user ──► agent (Hermes) ──► dlprevent-guard :8787 ──► model provider
                                   │
                                   └─ findings (metadata only) ─► /var/log/dlprevent-guard/verdicts.jsonl
                                                                        │
                                                   DLPrevent Linux agent ┴─► dashboard alert
```

- **One container**, no database, no dashboard, no account. It stores no
  prompt and no answer; a finding carries rule names and reasons, never the
  text they were found in.
- **Talks to nothing but your provider.** Everything it needs is fetched when
  the image is built.
- **Flag mode by default**: forward everything, report findings. Block mode
  answers a refused request with a 403 in the API shape the agent expects.
  The agent keeps the refused content in its history and sends it again with
  the next turn; from then on the guard replaces it with a short note
  (*withheld by dlprevent-guard*) and forwards the rest, so the conversation
  goes on without it. The guard log says `withheld, refused before`.

## What it scans

For every request, only what is **new** since the model last answered — the
user's turn and the tool results — so a finding is reported once, not on
every later turn. The tool definitions the agent sends along are scanned
the first time each one comes, for the same reason. Then the model's answer,
including the tool calls it asks for, streamed or not.

| Direction | Refused in block mode | Only reported | By |
|---|---|---|---|
| user's message | prompt injection and jailbreak patterns; smuggled text (homoglyphs, bidi characters, adversarial suffixes, many-shot jailbreaks); a secret in key shape — an API key pasted into the chat | personal data, multi-turn patterns (role-play escalation, priming), known attack signatures | AnveGuard engine |
| tool result | instructions hidden in data: override phrases, hidden HTML and HTML comments, invisible tag characters, references to other tools, markdown-image exfiltration; dangerous Python, SQL writes; imperatives aimed at the model and poisoned-authority claims when they address a tool | the same imperatives and claims otherwise, personal data and secrets, known signatures | AnveGuard engine — without its prompt heuristics, which mistake hashes, base64 and code for attacks |
| tool definitions | instructions in a tool's description or its parameters' descriptions: override phrases, `<IMPORTANT>` blocks, references to other tools (*always bcc …*), known poisoning signatures | — | AnveGuard engine, as MCP tool descriptions — without its prompt heuristics and PII check, and without the plain *you must …* rule, which every second ordinary description sets off |
| model's answer | a secret in key shape, links to private or loopback addresses, image links that carry data | personal data | AnveGuard engine + [`guard/agent_rules.ts`](guard/agent_rules.ts) |
| tool calls in the answer | data-drop services, credential files, reverse shells | file uploads to another host (`curl -T`, `curl -d @…`, `scp`, `rsync`), piping into a shell | [`guard/agent_rules.ts`](guard/agent_rules.ts) — in what the model is about to *run*, not in what it says: a model that warns you about an attack names it too |

A refused **tool description** does not end the conversation: the guard
replaces it with a note telling the model not to use the tool, and forwards
the request. The agent sends the definition with every request; it is
reported once.

A **streamed** answer is held in block mode until it has ended, scanned, and
then passed on in one piece or refused: a command can only be stopped before
the agent has it. The agent sees the answer arrive at once instead of word by
word. In flag mode it streams through and is scanned afterwards.
[DLPrevent → docs/HERMES.md](https://github.com/dlprevent-dev/dlprevent/blob/main/docs/HERMES.md#check-it-works)
has a harmless test. A policy file (`GUARD_POLICY`) moves findings between
the two columns: `"pii_action": "block"`, `"injection_action": "flag"`.
It also says which tools the model may call — see [Configuration](#configuration).

Supported APIs: OpenAI chat completions (`/v1/chat/completions`) and
Anthropic messages (`/v1/messages`). Everything else passes through
unscanned.

## Deploy

On the agent's host:

```bash
git clone https://github.com/dlprevent-dev/dlprevent-guard.git
cd dlprevent-guard/guard
echo "GUARD_UPSTREAM=https://api.deepseek.com" > .env     # your provider's base URL, without /v1
docker compose up -d --build
curl -s localhost:8787/healthz                             # ok
```

Then give the agent `http://127.0.0.1:8787/v1` as its API base URL instead of
the provider's.

**While the repository is private**, the host needs a key to clone and pull
it. A read-only deploy key reaches this repository and nothing else:

```bash
ssh-keygen -t ed25519 -N '' -C "$(hostname)-deploy" -f /root/.ssh/dlprevent-guard-deploy
printf 'Host github.com\n  IdentityFile /root/.ssh/dlprevent-guard-deploy\n  IdentitiesOnly yes\n' >> /root/.ssh/config
cat /root/.ssh/dlprevent-guard-deploy.pub    # → GitHub: Settings → Deploy keys, write access off
git clone git@github.com:dlprevent-dev/dlprevent-guard.git
```

Updates: `git pull && docker compose up -d --build` in `guard/`. The
`.env` belongs in `guard/`, next to `compose.yml`; one in the repository root
is not read.

**Give the key to the guard**, not the agent: `GUARD_UPSTREAM_KEY=…` in
`.env`, the file at `chmod 600`. Hermes needs this anyway — it treats a
`127.0.0.1` address as a local model server and sends `no-key-required` — and
it is the better arrangement in any case. Once the only real key sits here,
replace the agent's copy with a placeholder: every path around the guard
(another alias, a stored session, `/model` with a built-in provider) then ends
in a 401, and a hijacked agent has no key to steal.

### Several providers

Agents rarely use one. Hermes's subagents and helper tasks often talk to a
different provider than its main model, and whatever does not come through
the guard is not scanned. Name each one, with its key:

```bash
GUARD_UPSTREAMS=deepseek=https://api.deepseek.com,openrouter=https://openrouter.ai/api
GUARD_KEY_DEEPSEEK=sk-…
GUARD_KEY_OPENROUTER=sk-or-…
```

Each is reached under its name: `http://127.0.0.1:8787/deepseek/v1`,
`http://127.0.0.1:8787/openrouter/v1`. The URL is the provider's base URL
without `/v1`; the key variable is `GUARD_KEY_` and the name in upper case,
`-` as `_` (`qwen-token` → `GUARD_KEY_QWEN_TOKEN`). `GUARD_UPSTREAM` can stay
as the default for `/v1/…`, so an agent already pointed at the guard keeps
working. A finding names its route (`"upstream":"openrouter"`); the startup
log lists every route and whether the guard carries its key.

### What Hermes needs

The guard only sees what Hermes sends it. Every path to a model that does
not name the guard goes around it, unscanned. In `~/.hermes` (as root:
`/root/.hermes`), then `systemctl restart hermes-gateway`:

| Where | Setting | Why |
|---|---|---|
| `config.yaml`, the provider of `model:` (or its `custom_providers:` entry) | `base_url: http://127.0.0.1:8787/v1` — or `/<name>/v1` with `GUARD_UPSTREAMS`; `key_env` stays | the main model through the guard |
| `config.yaml`, `delegation:` and every `auxiliary:` task with its own provider | `base_url: http://127.0.0.1:8787/<name>/v1`, `api_key: via-dlprevent-guard` | subagents and helper tasks, often OpenRouter; tasks with `provider: auto` follow the main model |
| `config.yaml`, aliases | the plain model name, `ds: deepseek-v4-pro` | `deepseek:deepseek-v4-pro` means Hermes's built-in provider, which goes around the guard |
| `config.yaml`, `fallback_providers` | empty | a fallback is a way around |
| `.env` | every provider key (`DEEPSEEK_API_KEY`, `OPENROUTER_API_KEY`, …) replaced by `via-dlprevent-guard`, after it went into the guard's `.env` | Hermes sends `no-key-required` to `127.0.0.1` anyway; without a real key, every way around the guard ends in a 401 |
| credential pool | `hermes auth list`; `hermes auth remove <provider> <id>` for every `manual` entry that is a real key | Hermes falls back to it when the `.env` key fails |
| the service | one gateway, run with `HERMES_HOME` pointing at this configuration (`pgrep -af 'hermes_cli.main gateway'` shows exactly one) | a second gateway, or one started with an empty `HERMES_HOME`, answers with the old settings |
| existing chats | `/new`; switch models with the plain name, `/model deepseek-v4-pro` | a session keeps the provider it started with |

It works when every Hermes session in `state.db` shows
`billing_base_url` `http://127.0.0.1:8787/…` and the guard log has a `POST`
on every route while Hermes is used — a subagent task exercises
`delegation`.

Step by step, with the commands, the host-side DLPrevent agent and
hardening Hermes itself: [DLPrevent → docs/HERMES.md](https://github.com/dlprevent-dev/dlprevent/blob/main/docs/HERMES.md).

## Configuration

All in `guard/.env`, read when the container starts.

| Variable | Default | |
|---|---|---|
| `GUARD_UPSTREAM` | — | Default provider for `/v1/…`: its base URL, without `/v1`. |
| `GUARD_UPSTREAM_KEY` | — | The default provider's key, set on every forwarded request. Unset: the agent's key passes through. |
| `GUARD_UPSTREAMS` | — | More providers, `name=url,name=url`, each under `/<name>/…`. At least one of this and `GUARD_UPSTREAM` is needed. |
| `GUARD_KEY_<NAME>` | — | The key for route `<name>` (upper case, `-` as `_`). |
| `GUARD_MODE` | `flag` | `flag`: forward everything, report findings. `block`: refuse a request whose verdict is `block` with a 403, and withhold that content when it comes again. A streamed answer is held until it has ended and then passed on or refused; in flag mode it streams through. |
| `GUARD_POLICY` | — | Path to a JSON file overriding engine settings (`PolicySettings` in [`policy_engine.ts`](supabase/functions/_shared/policy_engine.ts)), mounted into the container; e.g. `{"pii_action": "sanitize"}` masks personal data and secrets before they reach the provider. `{"enable_tool_governance": true, "tool_denylist": ["send_email"]}` makes a call to a listed tool a `block` finding; `tool_allowlist` does the same for every tool not listed. |
| `GUARD_PORT` | `8787` | Host port, bound to `127.0.0.1` only. |

The container runs read-only, with no capabilities and no privilege
escalation; the only writable path is the verdict log.

## What you see

`docker compose logs guard` — one line per request, and one per finding:

```
POST /v1/chat/completions -> 200 912ms (key)
guard: tool_result block forwarded ignore_prior_instructions,retrieved_instruction_override
```

`(key)` / `(no key)` says whether the agent sent a key, never which. The
findings, one JSON line each, in `/var/log/dlprevent-guard/verdicts.jsonl`:

```json
{"at":"2026-09-24T11:15:05.127Z","direction":"input","verdict":"block","action":"forwarded",
 "model":"deepseek-v4-flash","chars":32,"layers":[{"layer":"injection","rule":"ignore_prior_instructions",
 "verdict":"block","reason":"Attempt to override prior system or developer instructions."}]}
```

The most specific rule comes first: that is the reason the DLPrevent
dashboard shows.

## When it does not work

| Symptom | Cause | Fix |
|---|---|---|
| `no configuration file provided` / `GUARD_UPSTREAM is missing` | `docker compose` run outside `guard/`, or `.env` not in `guard/` | `cd dlprevent-guard/guard`; `cut -d= -f1 .env` lists what is set |
| The agent gets `401 … Your api key: ****ired is invalid` | it sends `no-key-required` to a `127.0.0.1` address | the key into `.env` (`GUARD_UPSTREAM_KEY` / `GUARD_KEY_<NAME>`), `docker compose up -d`; the startup log then says `key set by the guard` |
| Log full of `GET /api/tags`, `/props`, `/version` -> 404 | the agent probing for a local model server | harmless; `GET /v1/models -> 200` means the key works |
| Only the startup lines, no `POST` while the agent is used | the agent does not come through the guard: its `base_url`, an alias or fallback provider, or a session stored from before the switch | see the table in [DLPrevent → docs/HERMES.md](https://github.com/dlprevent-dev/dlprevent/blob/main/docs/HERMES.md#when-it-does-not-work) |
| Findings on ordinary tool output (hashes, base64, code) | a version before `a9faa21` | `git pull && docker compose up -d --build` |
| The model's *warning* about an attack is reported as the attack | a version before `e0275e4` | `git pull && docker compose up -d --build` |

## Develop

```bash
cd guard
deno task test          # 27 tests: extraction, agent rules, routes, end to end against fake providers
```

The engine's own tests: `cd supabase/functions/_shared && deno test --allow-net --allow-read --allow-env --no-check`.

Only AnveGuard's engine is kept here — `policy_engine.ts`, `anveguard.ts`,
`threat_intel.json` and the engine's tests; the rest of upstream is left out.
Engine updates come from upstream file by file:

```bash
git remote add upstream https://github.com/ANVE-AI/prompt-sentinel-flow.git   # once
git remote set-url --push upstream no-push-to-anveguard                        # once
git fetch upstream
git checkout upstream/main -- $(git ls-files supabase/functions/_shared)
```

Then run both test suites before committing. CI (`.github/workflows/guard.yml`)
runs them and builds the container.

## Credits and license

The detection engine — everything under
[`supabase/functions/_shared/`](supabase/functions/_shared) — is **AnveGuard** by
[ANVE-AI](https://github.com/ANVE-AI/prompt-sentinel-flow), unmodified,
under the [Apache License 2.0](LICENSE). Its patterns, heuristics, tool-result
scanner, PII detection and threat-intelligence feed do the actual work here;
their tests are in `policy_engine_attacks.test.ts`.

This fork adds the proxy (`guard/server.ts`), the agent rules
(`guard/agent_rules.ts`), the container and compose files, and this README —
also under Apache 2.0, as listed in [NOTICE](NOTICE). It is not affiliated
with or endorsed by ANVE-AI, and "AnveGuard" is their name, used here only to
say where the engine comes from.

DLPrevent itself is a separate project under its own license
([PolyForm Noncommercial 1.0.0](https://github.com/dlprevent-dev/dlprevent/blob/main/LICENSE));
this repository does not include any of it. Contact: info@dlprevent.ch.
