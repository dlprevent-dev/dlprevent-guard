"""LangChain ChatOpenAI wrapper that targets the AnveGuard proxy.

Two ways to use it:

1.  ``ChatAnveGuard`` — a drop-in subclass of ``langchain_openai.ChatOpenAI``
    that pre-fills ``base_url`` and ``api_key`` from env vars. Use this when
    you want the LangChain interface.

2.  ``anveguard_chat_kwargs(...)`` — returns a dict you can splat into any
    ``ChatOpenAI(**kwargs)`` call yourself. Use this when you've already
    built your own subclass.
"""

from __future__ import annotations
import os
from typing import Any, Optional

DEFAULT_BASE_URL = "https://lyrmhuwvdflngizhcqbj.supabase.co/functions/v1/proxy/v1"


def _resolve_endpoint(base_url: Optional[str]) -> str:
    """Pick the AnveGuard endpoint. Explicit arg wins, then env, then default."""
    if base_url:
        return base_url
    env = os.environ.get("AG_BASE_URL") or os.environ.get("ANVEGUARD_BASE_URL")
    return env or DEFAULT_BASE_URL


def _resolve_key(api_key: Optional[str]) -> str:
    """Pick the AnveGuard key. Explicit arg wins, then env."""
    if api_key:
        return api_key
    key = os.environ.get("AG_KEY") or os.environ.get("ANVEGUARD_KEY")
    if not key:
        raise ValueError(
            "AnveGuard key not found. Set AG_KEY in the environment, "
            "or pass api_key=... to ChatAnveGuard."
        )
    return key


def anveguard_chat_kwargs(
    *,
    base_url: Optional[str] = None,
    api_key: Optional[str] = None,
) -> dict[str, Any]:
    """Return ChatOpenAI kwargs that point at AnveGuard. Use when subclassing."""
    return {
        "base_url": _resolve_endpoint(base_url),
        "api_key": _resolve_key(api_key),
    }


try:
    from langchain_openai import ChatOpenAI  # type: ignore
except Exception:  # pragma: no cover — optional dependency
    ChatOpenAI = None  # type: ignore


if ChatOpenAI is not None:

    class ChatAnveGuard(ChatOpenAI):  # type: ignore[misc, valid-type]
        """A ChatOpenAI subclass pre-configured for AnveGuard.

        All ChatOpenAI kwargs are supported. ``base_url`` and ``api_key`` are
        auto-resolved from env vars if not provided:

        - ``AG_BASE_URL`` (or ``ANVEGUARD_BASE_URL``) → ``base_url``
        - ``AG_KEY`` (or ``ANVEGUARD_KEY``) → ``api_key``
        """

        def __init__(
            self,
            *,
            base_url: Optional[str] = None,
            api_key: Optional[str] = None,
            **kwargs: Any,
        ) -> None:
            resolved = anveguard_chat_kwargs(base_url=base_url, api_key=api_key)
            super().__init__(**{**resolved, **kwargs})  # caller wins on overrides

else:

    class ChatAnveGuard:  # type: ignore[no-redef]
        """Placeholder when langchain-openai is not installed."""

        def __init__(self, **kwargs: Any) -> None:  # pragma: no cover
            raise ImportError(
                "ChatAnveGuard requires langchain-openai. "
                "Install with: pip install 'anveguard[langchain]'"
            )
