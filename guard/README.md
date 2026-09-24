# dlprevent-guard

A fork of [AnveGuard](https://github.com/ANVE-AI/prompt-sentinel-flow)
(Apache 2.0) cut down to one container: AnveGuard's policy engine as a
proxy between an AI agent (Hermes) and its model provider, reporting to
DLPrevent.

**Kept from upstream, untouched:** the engine in
`supabase/functions/_shared/` — prompt-injection patterns and heuristics,
the scan of tool results for hidden instructions, PII and secret detection,
the egress filter, the bundled threat-intel feed. Upstream rule updates
merge (`git pull upstream main`).

**Left out:** Supabase, Clerk, the Lovable classifier, the dashboard, the
request log. The container stores no prompt and no answer and talks to nothing but the
provider. It holds an API key only if you give it one
(`GUARD_UPSTREAM_KEY`); otherwise the agent's passes through.

**Added here** (`guard/`):

| File | What |
|---|---|
| `server.ts` | The proxy. Scans what is new in each request (user turn, tool results) and the model's answer (text and tool calls, streamed or not). |
| `agent_rules.ts` | Rules for what an agent is about to *do*, which upstream let through: data-drop services (webhook.site, paste sites, tunnels), credential files (`~/.ssh`, `~/.hermes/.env`, `/etc/shadow`), file uploads, reverse shells, piping downloads into a shell, markdown-image exfiltration in the answer. |
| `compose.yml` | The one file to deploy. |

## Deploy

On the Hermes host:

```bash
cd guard
echo GUARD_UPSTREAM=https://openrouter.ai/api > .env   # your provider's base URL
docker compose up -d --build
curl -s localhost:8787/healthz                          # ok
```

Then give Hermes `http://127.0.0.1:8787/v1` as its API base URL instead
of the provider's.

| Variable | Default | |
|---|---|---|
| `GUARD_UPSTREAM` | — | The provider's base URL, without `/v1`. |
| `GUARD_MODE` | `flag` | `flag`: forward everything, report findings. `block`: refuse a request the rules call `block` with a 403 in the agent's API shape. A streamed answer is always forwarded and reported afterwards. |
| `GUARD_POLICY` | — | Path to a JSON file overriding engine settings (`PolicySettings` in `policy_engine.ts`), e.g. `{"pii_action": "block"}`. |
| `GUARD_UPSTREAM_KEY` | — | The provider's API key, set by the guard on every forwarded request. Needed for Hermes: it takes a `127.0.0.1` address for a local model server and sends `no-key-required` instead of its key. Unset: the agent's key passes through. Keep `.env` at `chmod 600`. |
| `GUARD_PORT` | `8787` | Host port, bound to 127.0.0.1. |

## What DLPrevent sees

Every finding is one line in `/var/log/dlprevent-guard/verdicts.jsonl`:
direction (`input`, `tool_result`, `output`), verdict, whether it was
refused, model, tool, rule names and reasons — never the text. The
DLPrevent Linux agent on the same host reads that file and shows each
finding as an alert on its dashboard. The agent itself is not in this
compose file: it watches the host's kernel and is installed on the host
(`apt install ./deelpe_*.deb`).

## Develop

```bash
cd guard && deno task test
```

Supported APIs: OpenAI chat completions (`/v1/chat/completions`) and
Anthropic messages (`/v1/messages`). Everything else passes through
unscanned.
