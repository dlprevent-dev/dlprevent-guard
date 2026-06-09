"""Offline tests — no network, no LangChain required for the resolver tests."""

from __future__ import annotations
import os

import pytest

from anveguard import (
    AnveGuardVerdictCallback,
    BlockedByPolicy,
    FlaggedByPolicy,
    anveguard_chat_kwargs,
)


def test_resolver_uses_explicit_kwargs():
    kw = anveguard_chat_kwargs(base_url="https://example.com/v1", api_key="ag_live_xxx")
    assert kw == {"base_url": "https://example.com/v1", "api_key": "ag_live_xxx"}


def test_resolver_falls_back_to_env(monkeypatch):
    monkeypatch.setenv("AG_BASE_URL", "https://env.example/v1")
    monkeypatch.setenv("AG_KEY", "ag_live_from_env")
    kw = anveguard_chat_kwargs()
    assert kw["base_url"] == "https://env.example/v1"
    assert kw["api_key"] == "ag_live_from_env"


def test_resolver_raises_without_key(monkeypatch):
    monkeypatch.delenv("AG_KEY", raising=False)
    monkeypatch.delenv("ANVEGUARD_KEY", raising=False)
    with pytest.raises(ValueError, match="AnveGuard key not found"):
        anveguard_chat_kwargs()


def test_callback_extracts_envelope_from_llm_output():
    cb = AnveGuardVerdictCallback(raise_on_block=True)

    class FakeResponse:
        llm_output = {
            "anveguard": {
                "blocked": True,
                "reason": "Prompt injection attempt",
                "layers": [{"layer": "injection", "verdict": "block", "rule": "ignore_previous"}],
            }
        }
        generations: list = []

    with pytest.raises(BlockedByPolicy) as ei:
        cb.on_llm_end(FakeResponse())
    err = ei.value
    assert err.rule == "ignore_previous"
    assert err.layer == "injection"
    assert len(err.layers) == 1


def test_callback_passes_through_when_clean():
    cb = AnveGuardVerdictCallback()

    class FakeResponse:
        llm_output = {"token_usage": {"total_tokens": 7}}
        generations: list = []

    cb.on_llm_end(FakeResponse())  # no raise


def test_flag_can_optionally_raise():
    cb = AnveGuardVerdictCallback(raise_on_block=False, raise_on_flag=True)

    class FakeResponse:
        llm_output = {
            "anveguard": {
                "flagged": True,
                "reason": "Sensitive PII detected",
                "layers": [{"layer": "patterns", "verdict": "flag", "rule": "pii_detection"}],
            }
        }
        generations: list = []

    with pytest.raises(FlaggedByPolicy):
        cb.on_llm_end(FakeResponse())


def test_on_verdict_hook_runs_for_every_response():
    seen = []
    cb = AnveGuardVerdictCallback(raise_on_block=False, on_verdict=seen.append)

    class FakeResponse:
        llm_output = {
            "anveguard": {"blocked": False, "flagged": True, "layers": []}
        }
        generations: list = []

    cb.on_llm_end(FakeResponse())
    assert len(seen) == 1
    assert seen[0]["flagged"] is True
