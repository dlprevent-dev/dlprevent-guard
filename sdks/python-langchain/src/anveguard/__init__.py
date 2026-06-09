"""AnveGuard Python SDK.

Drop-in LangChain / LangGraph integration for AnveGuard — the open-source LLM
firewall. AnveGuard is an OpenAI-compatible reverse proxy, so this package is a
thin convenience wrapper: it points your existing LangChain / LangGraph code at
your AnveGuard endpoint, surfaces policy verdicts in tracebacks, and ships a
callback handler that logs blocks / flags into your own observability stack.

Quickstart
----------
    import os
    from anveguard import ChatAnveGuard

    os.environ["AG_KEY"] = "ag_live_xxx"
    llm = ChatAnveGuard(model="gpt-4o-mini")
    print(llm.invoke("Hello").content)

LangGraph
---------
    from anveguard.langgraph import GuardedChatNode
    node = GuardedChatNode(model="gpt-4o-mini")
    state["response"] = node(state)
"""

from .chat import ChatAnveGuard, anveguard_chat_kwargs
from .callbacks import AnveGuardVerdictCallback
from .errors import AnveGuardError, BlockedByPolicy, FlaggedByPolicy

__all__ = [
    "ChatAnveGuard",
    "anveguard_chat_kwargs",
    "AnveGuardVerdictCallback",
    "AnveGuardError",
    "BlockedByPolicy",
    "FlaggedByPolicy",
]

__version__ = "0.1.0"
