"""LangChain callback that surfaces AnveGuard policy verdicts.

AnveGuard stamps every blocked response with a JSON envelope:

    {
        "choices": [{...}],
        "anveguard": {"blocked": true, "reason": "...", "layers": [...]}
    }

This callback inspects each LLM response, raises ``BlockedByPolicy`` when
``anveguard.blocked`` is true, and optionally logs flag verdicts so they show
up in your LangSmith / Langfuse / OTel traces.
"""

from __future__ import annotations
from typing import Any, Optional

from .errors import BlockedByPolicy, FlaggedByPolicy

try:
    from langchain_core.callbacks import BaseCallbackHandler  # type: ignore
except Exception:  # pragma: no cover
    BaseCallbackHandler = object  # type: ignore


class AnveGuardVerdictCallback(BaseCallbackHandler):  # type: ignore[misc, valid-type]
    """Surface AnveGuard verdicts in LangChain runs.

    Args:
        raise_on_block: When True (default), raise ``BlockedByPolicy`` so the
            LangChain chain stops on a block. The proxy already returned a
            content-filter message, so callers always know the request did
            not reach the upstream model.
        raise_on_flag: When True, also raise ``FlaggedByPolicy`` for flag
            verdicts. Default False (flag = allow + audit).
        on_verdict: Optional callable invoked with the full ``anveguard``
            envelope dict for every response, blocked or not. Use it to ship
            verdicts to your own observability sink.
    """

    def __init__(
        self,
        *,
        raise_on_block: bool = True,
        raise_on_flag: bool = False,
        on_verdict: Optional[Any] = None,
    ) -> None:
        super().__init__()
        self.raise_on_block = raise_on_block
        self.raise_on_flag = raise_on_flag
        self.on_verdict = on_verdict

    @staticmethod
    def _envelope(response: Any) -> Optional[dict[str, Any]]:
        """Extract the ``anveguard`` envelope from a LangChain LLMResult."""
        # langchain_openai stashes provider raw response in llm_output
        out = getattr(response, "llm_output", None) or {}
        env = out.get("anveguard")
        if isinstance(env, dict):
            return env
        # streaming path: scan generations[].generation_info
        for gens in getattr(response, "generations", []) or []:
            for g in gens:
                info = getattr(g, "generation_info", None) or {}
                env = info.get("anveguard")
                if isinstance(env, dict):
                    return env
        return None

    def on_llm_end(self, response: Any, **kwargs: Any) -> None:  # type: ignore[override]
        env = self._envelope(response)
        if env is None:
            return
        if self.on_verdict is not None:
            try:
                self.on_verdict(env)
            except Exception:
                pass  # never let user code break the callback
        if env.get("blocked") and self.raise_on_block:
            layers = env.get("layers") or []
            top = next((l for l in layers if l.get("verdict") == "block"), {})
            raise BlockedByPolicy(
                env.get("reason") or "Blocked by AnveGuard policy",
                rule=top.get("rule"),
                layer=top.get("layer"),
                layers=layers,
            )
        if env.get("flagged") and self.raise_on_flag:
            layers = env.get("layers") or []
            top = next((l for l in layers if l.get("verdict") == "flag"), {})
            raise FlaggedByPolicy(
                env.get("reason") or "Flagged by AnveGuard policy",
                rule=top.get("rule"),
                layer=top.get("layer"),
                layers=layers,
            )
