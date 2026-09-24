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
  every **tool result**, where it actually arrives.
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

## What it scans

For every request, only what is **new** since the model last answered — the
user's turn and the tool results — so a finding is reported once, not on
every later turn. Then the model's answer, including the tool calls it asks
for, streamed or not.

| Direction | Checked for | By |
|---|---|---|
| user's message | prompt injection, jailbreak patterns and heuristics, personal data and secrets, known attack signatures | AnveGuard engine |
| tool result | instructions hidden in data (override phrases, imperatives aimed at the model, hidden HTML, poisoned-authority claims), injection, personal data and secrets, known signatures | AnveGuard engine — without its prompt heuristics, which mistake hashes, base64 and code for attacks |
| model's answer | secrets and personal data, links to private addresses, markdown-image exfiltration | AnveGuard engine + [`guard/agent_rules.ts`](guard/agent_rules.ts) |
| tool calls in the answer | data-drop services, credential files, file uploads, reverse shells, piping into a shell — in what the model is about to *run*, not in what it says: a model that warns you about an attack names it too | [`guard/agent_rules.ts`](guard/agent_rules.ts) |

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

The complete setup with Hermes and DLPrevent, including hardening the agent
itself: [DLPrevent → docs/HERMES.md](https://github.com/dlprevent-dev/dlprevent/blob/main/docs/HERMES.md).

## Configuration

All in `guard/.env`, read when the container starts.

| Variable | Default | |
|---|---|---|
| `GUARD_UPSTREAM` | — | Default provider for `/v1/…`: its base URL, without `/v1`. |
| `GUARD_UPSTREAM_KEY` | — | The default provider's key, set on every forwarded request. Unset: the agent's key passes through. |
| `GUARD_UPSTREAMS` | — | More providers, `name=url,name=url`, each under `/<name>/…`. At least one of this and `GUARD_UPSTREAM` is needed. |
| `GUARD_KEY_<NAME>` | — | The key for route `<name>` (upper case, `-` as `_`). |
| `GUARD_MODE` | `flag` | `flag`: forward everything, report findings. `block`: refuse a request whose verdict is `block` with a 403. A streamed answer is always forwarded and reported afterwards. |
| `GUARD_POLICY` | — | Path to a JSON file overriding engine settings (`PolicySettings` in [`policy_engine.ts`](supabase/functions/_shared/policy_engine.ts)), mounted into the container; e.g. `{"pii_action": "sanitize"}` masks personal data and secrets before they reach the provider. |
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

## Develop

```bash
cd guard
deno task test          # 19 tests: extraction, agent rules, routes, end to end against fake providers
```

Upstream updates to the engine:

```bash
git remote add upstream https://github.com/ANVE-AI/prompt-sentinel-flow.git   # once
git pull upstream main
```

The guard only adds files under `guard/`, `NOTICE`, this README and one logo;
upstream's own files are unchanged, so their updates merge. The one file both
sides touch is `README.md` — upstream's lives on as
[`README.upstream.md`](README.upstream.md); on a conflict, keep this one and
carry their changes over there.

## Credits and license

The detection engine — everything under
[`supabase/functions/_shared/`](supabase/functions/_shared) and the rest of
the upstream tree — is **AnveGuard** by
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
