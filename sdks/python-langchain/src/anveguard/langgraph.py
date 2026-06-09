"""LangGraph-friendly helpers.

LangGraph nodes are plain callables, so the simplest way to wire AnveGuard in
is to instantiate ``ChatAnveGuard`` inside a node and call it with the message
history from your graph state. This module provides one common pattern:
``GuardedChatNode`` — a callable that takes a state dict and returns the
assistant message, with policy blocks surfaced as state updates rather than
raised exceptions (the LangGraph way of handling control flow).
"""

from __future__ import annotations
from typing import Any, Optional

from .chat import ChatAnveGuard
from .callbacks import AnveGuardVerdictCallback
from .errors import BlockedByPolicy


class GuardedChatNode:
    """A LangGraph node that calls AnveGuard and gracefully surfaces blocks.

    Args:
        model: The model name to invoke.
        messages_key: State key holding the message history. Default "messages".
        output_key: State key to write the assistant response to. Default "response".
        block_key: State key to write block info to when a request is blocked.
            Default "blocked". Reading this in a graph router lets you branch on
            blocked vs allowed without try/except in the graph.
        **chat_kwargs: Extra kwargs passed to ChatAnveGuard.

    Example:
        node = GuardedChatNode(model="gpt-4o-mini")
        new_state = node({"messages": [HumanMessage("Hi")]})
        if new_state.get("blocked"):
            return route_to_safety_node(new_state)
    """

    def __init__(
        self,
        *,
        model: str,
        messages_key: str = "messages",
        output_key: str = "response",
        block_key: str = "blocked",
        **chat_kwargs: Any,
    ) -> None:
        self.llm = ChatAnveGuard(
            model=model,
            **chat_kwargs,
            callbacks=[AnveGuardVerdictCallback(raise_on_block=True)],
        )
        self.messages_key = messages_key
        self.output_key = output_key
        self.block_key = block_key

    def __call__(self, state: dict[str, Any]) -> dict[str, Any]:
        msgs = state.get(self.messages_key, [])
        try:
            resp = self.llm.invoke(msgs)
            return {self.output_key: resp, self.block_key: None}
        except BlockedByPolicy as e:
            return {
                self.output_key: None,
                self.block_key: {
                    "reason": e.reason,
                    "rule": e.rule,
                    "layer": e.layer,
                    "layers": e.layers,
                },
            }
