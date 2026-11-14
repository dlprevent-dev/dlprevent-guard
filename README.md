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
- **Commands that destroy** — the disk wiped, the guard itself stopped or
  gone around — and the ones an operator wants to hear about: a dropped
  database, a force push, the firewall off, a new cron job.

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
  text they were found in — and the name of the tool it came from, which an
  MCP server chooses: cut to 64 characters, letters, digits and `_.:@/+-`.
- **Talks to nothing but your provider** — and the classifier container
  next to it, if you start that one. Everything the guard needs is fetched
  when its image is built; the classifier fetches its model on its first
  start.
- **Flag mode by default**: forward everything, report findings — except
  what is over a [limit](#limits) you set. Block mode
  answers a refused request with a 403 in the API shape the agent expects.
  The agent keeps the refused content in its history and sends it again with
  the next turn; from then on the guard replaces it with a short note
  (*withheld by dlprevent-guard*) and forwards the rest, so the conversation
  goes on without it. The guard log says `withheld, refused before`.

## What it scans

For every request, what is **new** since the model last answered — the
user's turn and the tool results, documents and search results in any
content part — and every earlier turn the guard has not seen yet (a session
older than the guard), so a finding is reported once, not on every later
turn. The system prompt and the tool definitions the agent sends along are
scanned the first time each one comes, for the same reason. Then the model's
answer, including the tool calls it asks for, streamed or not. A piece the
guard could not scan is a `block` finding of its own (`guard_scan_failed`),
so that making the scanner fail is not a way past it. Block mode treats it
like any other: refused — a tool description or system prompt withheld, and
with `GUARD_TRUST_USER` what the user typed only reported. The rest of the
request is still scanned. A streamed answer that breaks off in flag mode is
reported the same way.

| Direction | Refused in block mode | Only reported | By |
|---|---|---|---|
| user's message | prompt injection and jailbreak patterns, the override phrases among them also in German, French and Italian and with their letters spaced out (`i g n o r e`); smuggled text (homoglyphs, bidi characters, adversarial suffixes, many-shot jailbreaks); a secret in key shape — an API key pasted into the chat | personal data, known attack signatures, and patterns over several turns of what the person typed (a jailbreak persona that keeps coming back, priming, instructions flipped back and forth, encoded text growing from turn to turn, a sudden very long turn) — on the turn that completes one, not on every turn after | AnveGuard engine + [`guard/languages.ts`](guard/languages.ts) |
| tool result | instructions hidden in data: override phrases (English, German, French, Italian), hidden HTML and HTML comments, invisible tag characters, references to other tools, markdown-image exfiltration with a placeholder; dangerous Python, SQL writes; imperatives aimed at the model in an `<IMPORTANT>`-style block, and poisoned-authority claims when they address a tool | the same imperatives, image links and claims otherwise, override phrases worded as memory housekeeping, personal data and secrets, known signatures | AnveGuard engine — without its prompt heuristics, which mistake hashes, base64 and code for attacks — + [`guard/languages.ts`](guard/languages.ts) |
| system prompt | as tool definitions — an agent builds it from memory it wrote itself and from context files in the repository it works in | — | AnveGuard engine, as data, + [`guard/languages.ts`](guard/languages.ts); with `GUARD_TRUST_USER` only reported |
| tool definitions | instructions in a tool's description or its parameters' descriptions: override phrases, `<IMPORTANT>` blocks, references to other tools (*always bcc …*), known poisoning signatures | a definition that changed since the guard let it through under the same name (`tool_definition_changed`, the rug pull), once per change | AnveGuard engine, as MCP tool descriptions — without its prompt heuristics and PII check, and without the plain *you must …* rule, which every second ordinary description sets off — + [`guard/languages.ts`](guard/languages.ts) |
| model's answer | a secret in key shape, links to private or loopback addresses, image links that carry data | personal data; 60 characters of the system prompt word for word (`system_prompt_leak`) — an agent's system prompt holds its memory and context files, which it quotes in ordinary work; an image whose address carries a query, data shorter than the refused kind (`markdown_image_query`) | AnveGuard engine + [`guard/agent_rules.ts`](guard/agent_rules.ts); the system prompt in [`guard/server.ts`](guard/server.ts) |
| tool calls in the answer | data-drop services, credential files, a hidden file in a home directory, a `.env` or the environment sent to any host (also over `ssh`, `aws s3`, `gh gist`, Node's `https`, a DNS lookup), file uploads to another host (`curl -T`, `curl -d @…` or `"$(…)"`, `scp`, `rsync`) — to loopback or a `GUARD_UPLOAD_HOSTS` host only reported, and refused whenever the guard cannot tell where it goes; reverse shells, a base64 blob decoded into a shell; `rm -r` on the root, a home, a system directory or a data mount itself (also after a `cd` into it), a disk overwritten (`dd`, `mkfs`, a redirect); the guard stopped, its verdict log, policy or `GUARD_…` settings changed, its `.env` with the provider keys read, or Hermes's config pointed past it — also when quotes or `$'\x..'` escapes split the words | a download piped into a shell; a database or table dropped, a force push, `chmod 777`, the machine shut down; a firewall, auditing or the shell history switched off; a cron job or systemd unit installed | [`guard/agent_rules.ts`](guard/agent_rules.ts) — in what the model is about to *run*, not in what it says: a model that warns you about an attack names it too |

An **image, a sound or a file's bytes** in what is new — a photo the user
sent, a screenshot a tool returned, a PDF — is read by the model but not by
the guard: reported once per request that brings it (`unscanned_content`,
`Not scanned: 1 image_url`), never refused.

A refused **tool description** or **system prompt** does not end the
conversation: the guard replaces it with a note telling the model it was
blocked, and forwards the request. The agent sends it with every request;
it is reported once.

A **streamed** answer is held in block mode until it has ended, scanned, and
then passed on in one piece or refused: a command can only be stopped before
the agent has it. The agent sees the answer arrive at once instead of word by
word. In flag mode it streams through and is scanned afterwards.
[DLPrevent → docs/HERMES.md](https://github.com/dlprevent-dev/dlprevent/blob/main/docs/HERMES.md#check-it-works)
has a harmless test. A policy file (`GUARD_POLICY`) moves findings between
the two columns: `"pii_action": "block"`, `"injection_action": "flag"`.
With `"sanitize"` block mode sends the piece on with the finding masked
(`[REDACTED:email]`, `[redacted]`) instead of refusing it.
It also says which tools the model may call — see [Configuration](#configuration).

Supported APIs: OpenAI chat completions (`/v1/chat/completions`) and
Anthropic messages (`/v1/messages`), however the path is spelled (`//`, a
trailing `/`, `%2F`). Everything else passes through unscanned — in block
mode except what makes the model answer: `/v1/responses`, `/v1/completions`
and batches are refused, since the guard does not read them. Block mode also
refuses what it cannot read instead of letting it past: a body that is not
JSON (`NaN`, say), a compressed body, a body over 32 MB, and an answer that is
neither JSON nor a stream. A request that carries an `Origin` header — a
browser, not an agent — is refused in both modes, so a web page cannot spend
the key the guard carries. A redirect from the provider is passed back to the
agent, never followed by the guard.

Known gaps: the assistant turns an agent sends back as history are not
scanned (they were scanned when the model gave them). A person who types
Hermes's own markers (`<memory-context>`, a skill header, a cron job's or a
compaction's opening line) gets that text scanned as data: with the injection
patterns and — unless `GUARD_TRUST_USER` is set — a check for text turned
around with direction overrides, but without the prompt heuristics, which
real memory and script output set off. A gibberish suffix or look-alike
letters between markers pass.

The override phrases in German, French and Italian are a list of phrasings,
kept no stricter than the engine is in English: an imperative about *all*
earlier instructions or the model's own. A paraphrase, another language,
swapped letters (`ignroe`) or words spaced exactly like their letters pass,
and only a [trained classifier](#trained-classifier) answers those. As in English, a person taking back their own instructions
(*vergiss die vorherigen Anweisungen, ich habe mich vertan*) is refused.

The tool-call rules read one answer at a time, and a shell command by its
words. A secret read in one turn and sent in a later one is not put together;
a command assembled from variables or `eval` is not unfolded — only quoting
is. `rm -rf ~/Documents` passes: only the root, a home, a system directory or
a data mount itself counts as a wipe. The guard is known by its name, its
port, its files and a `cd` into its directory on the same line; stopped any
other way (`docker compose down` in a shell that is already there) it is not
recognised, and neither is a file tool that writes a cron file or Hermes's
config without naming a command. A link in the answer counts as carrying
data only with a long query (over 80 characters, upstream's `url_exfil`), a
markdown image with any query; an `<img>` tag, a reference-style image or a
`//host` address without a scheme only when the data in it is long. What an agent may not do at all belongs in
`tool_allowlist`, and keeping the provider keys in the guard is what makes a
way around it end in a 401. Hex-encoded data in an image path passes.

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

### Limits

An agent in a loop, or one talked into one, spends without end (OWASP LLM10).
In `.env`:

```bash
GUARD_MODELS=deepseek-*,gpt-4o-mini     # the models it may ask for
GUARD_MAX_TOKENS=8192                   # the most output one answer may ask for
GUARD_RATE=60                           # requests a minute, for the whole guard
```

These hold in both modes: a limit you set is not a guess that may be wrong.
Another model is refused with a 403 (`model_not_allowed`), a larger
`max_tokens` or `max_completion_tokens` is lowered to the limit, and a
request over the rate gets a 429 with `Retry-After`, which the agent's SDK
waits out — reported once a minute (`rate_limited`). OpenRouter's fallback
list (`models`) is checked like `model`. With `GUARD_MODELS` or
`GUARD_MAX_TOKENS` set, flag mode too refuses what the guard cannot check:
`/v1/responses`, a compressed body, one that is not JSON. A request that sets
no output limit keeps the provider's, and `n` — several answers at once — is
not limited. The minute is the clock's: across its turn up to twice the rate
gets through.

### Trained classifier

The word lists catch the phrasings they know. A trained model catches the
rest — paraphrases, swapped letters, other languages — and makes mistakes of
its own, so it starts in shadow mode: it reports, it refuses nothing.

```bash
docker compose --profile classifier up -d --build
```

and in the policy file (`GUARD_POLICY`, see [Configuration](#configuration)):

```json
{"enable_trained_classifier": true, "classifier_endpoint_url": "http://classifier:8000/"}
```

Every piece but the model's answer then goes through it as well: what the
user typed, tool results, tool definitions, the system prompt — skipped
where another rule already refuses. A hit is a `trained_classifier` finding
with its score. Read the findings for a while; when they hold, add
`"classifier_shadow_mode": false` and it refuses (`"classifier_action":
"flag"` to keep it a report). `"classifier_threshold"` (default `0.8`) is
the score from which it counts.

The default model is
[ProtectAI's DeBERTa](https://huggingface.co/protectai/deberta-v3-base-prompt-injection-v2),
English only, ungated. Measured behind the guard: it caught every attack
tried — swapped letters (`ignroe`), *SYSTEM OVERRIDE* in a tool result, a
German and a French override, an order in an HTML comment — and let every
ordinary English sentence through. But it takes much ordinary German,
French and Italian for an attack: 4 of 20 ordinary sentences scored over
0.8 (*Kannst du mir die Rechnung vom März als PDF schicken?* scored 0.999).
For an agent people talk to in those languages, leave it in shadow mode or
use Meta's multilingual
[Llama Prompt Guard 2](https://huggingface.co/meta-llama/Llama-Prompt-Guard-2-86M) —
not tried here, since it is gated:
accept its licence on Hugging Face, then `CLASSIFIER_MODEL=meta-llama/Llama-Prompt-Guard-2-86M`
and `HF_TOKEN=hf_…` in `.env`. The model is fetched on the first start into
the `classifier-models` volume; after that the container needs no network.
It reads the first 512 tokens of each piece (the engine hands it 4,000
characters), one piece at a time, on the CPU: 130–300 ms per new
piece on an 11-core ARM machine; the image is 1.2 GB, the model about 0.7 GB more. An attack behind enough padding is past what it
reads. It is not published on the host — only the guard reaches it.

When the classifier cannot be reached, the guard goes on without it and
says so only on stderr (`trained classifier error` in `docker compose logs
guard`): it is a layer on top of the others, not one they rely on. One that
takes the request and does not answer holds a piece at most 5 seconds; then
the piece counts as not scanned (`guard_scan_failed`), refused in block mode.

Out of shadow mode a false positive in the system prompt withholds the whole
system prompt, as any finding there does; with `GUARD_TRUST_USER` the system
prompt is only reported.

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
| `GUARD_KEY_<NAME>` | — | The key for route `<name>` (upper case, `-` as `_`). Two routes that would share a variable (`a-b`, `a_b`) stop the guard from starting. |
| `GUARD_MODE` | `flag` | `flag`: forward everything, report findings. `block`: refuse a request whose verdict is `block` with a 403, and withhold that content when it comes again. A streamed answer is held until it has ended and then passed on or refused; in flag mode it streams through. |
| `GUARD_UPLOAD_HOSTS` | — | Hosts the agent may upload files to, besides loopback, comma-separated; `*.corp.example` covers its subdomains. In block mode an upload (`curl -d @…`, `scp`, `rsync` …) there is reported, not refused. Every other upload, and one whose destination the guard cannot read, is refused. |
| `GUARD_TRUST_USER` | — | `1`: in block mode, what the user typed and the system prompt are reported but never refused. For an agent only its owner can talk to (Hermes's platform allowlist): the owner is not the threat, what reaches the agent from outside is. Tool results, memory, skills, cron jobs, subagent tasks and the agent's own commands are still refused. Without it, a person may be typing Hermes's markers: what they enclose is then also checked for text turned around with direction overrides. |
| `GUARD_POLICY` | — | Path to a JSON file overriding engine settings (`PolicySettings` in [`policy_engine.ts`](supabase/functions/_shared/policy_engine.ts)), mounted into the container; e.g. `{"pii_action": "sanitize"}` masks personal data and secrets before they reach the provider — in block mode, and on the way in: a finding in the model's answer is reported, the answer is not rewritten. `"injection_action": "sanitize"` takes an injection's words out the same way. The agent keeps the text as it was and sends it again with every turn; it is masked each time and reported once. `{"enable_tool_governance": true, "tool_denylist": ["send_email"]}` makes a call to a listed tool a `block` finding; `tool_allowlist` does the same for every tool not listed. |
| `GUARD_MODELS` | — | The models the agent may ask for, comma-separated; `deepseek-*` for every name that starts with `deepseek-`. Any other is refused, in both modes. See [Limits](#limits). |
| `GUARD_MAX_TOKENS` | — | The most output one answer may ask for: a larger `max_tokens` or `max_completion_tokens` is lowered to it. |
| `GUARD_RATE` | — | Requests a minute, for the whole guard; more get a 429. A value that is not a whole number above 0 stops the guard from starting, as for `GUARD_MAX_TOKENS`. |
| `CLASSIFIER_MODEL` | ProtectAI's DeBERTa | The [trained classifier](#trained-classifier)'s model; `HF_TOKEN` for a gated one. |
| `GUARD_PORT` | `8787` | Port. `compose.yml` publishes it on the host's `127.0.0.1` only. |
| `GUARD_HOST` | `127.0.0.1` | Address the process listens on. The container image sets `0.0.0.0` — inside the container, so the port can be published; set it outside Docker only if other hosts are to reach the guard, which carries your provider keys and asks callers for nothing. |

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
dashboard shows. `"verdict":"sanitize"` goes with `"action":"forwarded"`: in
block mode the piece went on masked, in flag mode as it came.

## When it does not work

| Symptom | Cause | Fix |
|---|---|---|
| `no configuration file provided` / `GUARD_UPSTREAM is missing` | `docker compose` run outside `guard/`, or `.env` not in `guard/` | `cd dlprevent-guard/guard`; `cut -d= -f1 .env` lists what is set |
| The agent gets `401 … Your api key: ****ired is invalid` | it sends `no-key-required` to a `127.0.0.1` address | the key into `.env` (`GUARD_UPSTREAM_KEY` / `GUARD_KEY_<NAME>`), `docker compose up -d`; the startup log then says `key set by the guard` |
| Log full of `GET /api/tags`, `/props`, `/version` -> 404 | the agent probing for a local model server | harmless; `GET /v1/models -> 200` means the key works |
| Only the startup lines, no `POST` while the agent is used | the agent does not come through the guard: its `base_url`, an alias or fallback provider, or a session stored from before the switch | see the table in [DLPrevent → docs/HERMES.md](https://github.com/dlprevent-dev/dlprevent/blob/main/docs/HERMES.md#when-it-does-not-work) |
| Findings on ordinary tool output (hashes, base64, code) | a version before `a9faa21` | `git pull && docker compose up -d --build` |
| The model's *warning* about an attack is reported as the attack | a version before `e0275e4` | `git pull && docker compose up -d --build` |
| The agent gets `403 … model_not_allowed` | the model it asked for is not in `GUARD_MODELS` — a subagent or helper task often uses another one | add it, `docker compose up -d` |
| The agent stalls, the log shows `-> 429` and `rate_limited` | more requests a minute than `GUARD_RATE` — a busy agent with subagents makes several per turn | raise `GUARD_RATE` |
| No `trained_classifier` finding ever, `trained classifier error` in the guard log | the classifier container is not running, or still fetching its model | `docker compose --profile classifier up -d`, `docker compose logs classifier` |
| Block mode refuses everything, or every tool call, with `guard_scan_failed` | the scanner throws — most often on a `GUARD_POLICY` file with a value of the wrong type (a list written as a string) | `docker compose logs guard` names the error after `not scanned:`; fix the policy file, `docker compose up -d` |

## Develop

```bash
cd guard
deno task test          # 78 tests: extraction, agent rules, routes, end to end against fake providers
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

`policy_engine.ts` carries changes of this fork, each marked
`dlprevent-guard:` — carry them over after taking upstream's file. Then run
both test suites before committing. CI (`.github/workflows/guard.yml`)
runs them and builds the container.

## Credits and license

The detection engine — everything under
[`supabase/functions/_shared/`](supabase/functions/_shared) — is **AnveGuard** by
[ANVE-AI](https://github.com/ANVE-AI/prompt-sentinel-flow), under the
[Apache License 2.0](LICENSE). `policy_engine.ts` is modified here (see
NOTICE; each change is marked `dlprevent-guard:` in the file). Its patterns, heuristics, tool-result
scanner, PII detection and threat-intelligence feed do the actual work here;
their tests are in `policy_engine_attacks.test.ts`.

This fork adds the proxy (`guard/server.ts`), the agent rules
(`guard/agent_rules.ts`), the override phrases in German, French and Italian
(`guard/languages.ts`), the container and compose files, and this README —
also under Apache 2.0, as listed in [NOTICE](NOTICE). It is not affiliated
with or endorsed by ANVE-AI, and "AnveGuard" is their name, used here only to
say where the engine comes from.

DLPrevent itself is a separate project under its own license
([Apache License 2.0](https://github.com/dlprevent-dev/dlprevent/blob/main/LICENSE));
this repository does not include any of it. Contact: info@dlprevent.ch;
vulnerabilities as [SECURITY.md](SECURITY.md) says.
