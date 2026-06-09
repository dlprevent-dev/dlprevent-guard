"""Typed errors surfaced when AnveGuard returns a policy verdict."""

from __future__ import annotations
from typing import Any, Optional


class AnveGuardError(Exception):
    """Base class for all AnveGuard-raised errors."""


class BlockedByPolicy(AnveGuardError):
    """The proxy returned a block verdict. The request never hit the model.

    Carries the policy `reason`, the matched `rule`, and the full `layers`
    array so downstream code can attribute the block in audit logs.
    """

    def __init__(
        self,
        reason: str,
        *,
        rule: Optional[str] = None,
        layer: Optional[str] = None,
        layers: Optional[list[dict[str, Any]]] = None,
    ) -> None:
        super().__init__(reason)
        self.reason = reason
        self.rule = rule
        self.layer = layer
        self.layers = layers or []


class FlaggedByPolicy(AnveGuardError):
    """Surfaced only when the SDK is configured with ``raise_on_flag=True``.

    AnveGuard's default behavior is to allow flagged requests through and rely
    on the dashboard for audit. Callers who want hard-fail on flag opt in.
    """

    def __init__(
        self,
        reason: str,
        *,
        rule: Optional[str] = None,
        layer: Optional[str] = None,
        layers: Optional[list[dict[str, Any]]] = None,
    ) -> None:
        super().__init__(reason)
        self.reason = reason
        self.rule = rule
        self.layer = layer
        self.layers = layers or []
