# anveguard (Python SDK)

Drop-in **LangChain / LangGraph** integration for [AnveGuard](https://guard.citerlabs.com) — the open-source LLM firewall.

```bash
pip install 'anveguard[langchain]'
```

## Why

AnveGuard is OpenAI-compatible. You could just set `base_url` on `ChatOpenAI` and call it a day. This package does three things on top of that:

1. **Resolves config from env** (`AG_KEY`, `AG_BASE_URL`) so you don't paste it in every file.
2. **Surfaces policy verdicts as typed exceptions** (`BlockedByPolicy`, `FlaggedByPolicy`) — no more digging through `llm_output`.
3. **Ships a LangGraph node** that turns blocks into state updates instead of exceptions, so you can route on policy decisions in graph code.

## Quickstart — LangChain

```python
import os
from anveguard import ChatAnveGuard, AnveGuardVerdictCallback, BlockedByPolicy

os.environ["AG_KEY"] = "ag_live_xxx"

llm = ChatAnveGuard(
    model="gpt-4o-mini",
    callbacks=[AnveGuardVerdictCallback()],   # raises BlockedByPolicy on block
)

try:
    print(llm.invoke("Summarize this article in 3 bullets.").content)
except BlockedByPolicy as e:
    print(f"Policy hit: rule={e.rule} layer={e.layer} reason={e.reason}")
```

## Quickstart — LangGraph

```python
from langgraph.graph import StateGraph, END
from anveguard.langgraph import GuardedChatNode

chat = GuardedChatNode(model="gpt-4o-mini")  # adds policy callback for you

g = StateGraph(dict)
g.add_node("chat", chat)
g.add_conditional_edges(
    "chat",
    lambda s: "blocked" if s.get("blocked") else "ok",
    {"blocked": "safety_handler", "ok": END},
)
```

When AnveGuard blocks a request, the node returns `{"blocked": {...}, "response": None}` so your router can branch on it without try/except inside the graph.

## What you get for free

Because AnveGuard sits in front of every call:

- **Prompt-injection / jailbreak detection** (60+ deterministic detectors + LLM judge + pluggable trained classifier)
- **Tool-call governance** (allow / deny list on declared + invoked tools)
- **Output egress control** (block model output that posts to disallowed domains)
- **PII redaction** with sanitize verdicts
- **Audit log** of every request + every layer that fired
- **Multi-provider routing** with fallback chains
- **Drift detection** + behavior baselines per key

…all configured from the dashboard at `guard.citerlabs.com/dashboard/policies`. Your LangChain code stays the same.

## License

Apache 2.0. Same as the AnveGuard core.
