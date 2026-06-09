"""Core scanner — Python port of AnveGuard's evaluateRetrieved detectors.

Each detector returns zero or more ``Finding`` objects. Severity maps to
AnveGuard verdicts:
- ``block`` = block-grade attack (override, poisoned authority, hidden HTML
  with instructions, markdown image to non-allowlisted host)
- ``flag``  = suspicious but not decisive (imperative-to-model in benign-ish
  content, lots of zero-width chars)
- ``info``  = informational signal, useful for audit

The wire-format matches AnveGuard's LayerVerdict so callers can pipe scanner
output straight into the same dashboards.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Iterable, Literal, Optional
from urllib.parse import urlparse


Severity = Literal["block", "flag", "info"]
Source = Literal["rag", "scraped_html", "mcp_tool_result", "mcp_tool_desc", "email", "web"]


@dataclass
class Finding:
    """A single detector hit. ``rule`` matches the policy_engine.ts name."""

    rule: str
    severity: Severity
    reason: str
    matched: Optional[str] = None
    layer: str = "injection"
    source: Source = "rag"
    metadata: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return asdict(self)


# ----------------------------------------------------------------------------
# Detectors — direct ports of policy_engine.ts regex + heuristics
# ----------------------------------------------------------------------------

# "Ignore previous instructions" addressed to the model from inside retrieved data.
RETRIEVED_OVERRIDE_RE = re.compile(
    r"\b(?:ignore|disregard|forget|override|bypass)\s+(?:all\s+|the\s+|any\s+|your\s+|previous\s+|prior\s+|above\s+|earlier\s+)*"
    r"(?:previous\s+|prior\s+|above\s+|earlier\s+)?(?:instructions?|rules?|prompts?|system\s+(?:prompt|message)|guidelines?|directives?|context)\b"
    r"|\byou\s+are\s+(?:now\s+)?(?:in\s+(?:developer|debug|admin)\s+mode|jailbroken|dan|aim|uncensored|unfiltered)\b"
    r"|\b(?:new|updated|revised)\s+(?:instructions?|system\s+prompt|directives?)\s*[:\-—]",
    re.IGNORECASE,
)

# Imperatives addressed at the model.
TO_MODEL_IMPERATIVE_RE = re.compile(
    r"\b(?:you\s+(?:must|should|always|need\s+to|have\s+to)"
    r"|before\s+(?:any\s+|each\s+|every\s+)?(?:call|use|invocation|response)"
    r"|always\s+(?:call|read|include|append|send|forward|copy|bcc|cc)"
    r"|first\s+(?:call|execute|run|read|fetch))\b"
    r"|<\s*(important|system|sys|admin|internal|note)\s*>[\s\S]{20,}<\s*/\s*\1\s*>",
    re.IGNORECASE,
)

# "This document supersedes all others / trust only this source" — ConfusedPilot.
RETRIEVED_AUTHORITY_RE = re.compile(
    r"\b(?:this\s+(?:document|content|message|source|file|note)\s+(?:is\s+)?(?:the\s+)?(?:most\s+|single\s+|only\s+)?"
    r"(?:authoritative|trusted|definitive|(?:takes?|has)\s+precedence|supersedes?|overrides?|trumps?\s+(?:all|any|every|other))"
    r"|(?:ignore|disregard|do\s+not\s+(?:use|cite|reference|trust|read))\s+(?:all\s+)?(?:the\s+)?(?:other|previous|prior|remaining)\s+"
    r"(?:documents?|sources?|results?|chunks?|context|files?)"
    r"|trust\s+only\s+this)\b",
    re.IGNORECASE,
)

# Hidden CSS — display:none, visibility:hidden, white-on-white, off-screen,
# zero-opacity, zero-font-size, or explicit aria-hidden on retrievable elements.
_HIDDEN_PATTERNS = [
    r"display\s*:\s*none",
    r"visibility\s*:\s*hidden",
    r"opacity\s*:\s*0(?:\.0+)?",
    r"font-size\s*:\s*0",
    r"color\s*:\s*(?:white|#fff(?:fff)?)",
    r"color\s*:\s*rgb\(\s*255\s*,\s*255\s*,\s*255",
    r"position\s*:\s*absolute[^\"']*(?:left|top)\s*:\s*-\d{3,}",
    r"aria-hidden\s*=\s*[\"']true",
]
HIDDEN_CSS_RE = re.compile("|".join(_HIDDEN_PATTERNS), re.IGNORECASE)

# Zero-width characters — invisible text often used to smuggle instructions.
ZERO_WIDTH_RE = re.compile(r"[​-‍⁠﻿‪-‮⁦-⁩]")

# Markdown image exfil — ![alt](url?leak={{secret}}) — long URLs, templated, or to unknown hosts.
MD_IMAGE_RE = re.compile(r"!\[[^\]]*\]\(([^)]+)\)")
URL_TEMPLATE_RE = re.compile(r"\{\{[^}]+\}\}|\{[A-Za-z_][A-Za-z0-9_]*\}")

# Fake tool-call JSON in free text (when no tools were declared in the request).
TOOL_CALL_JSON_RE = re.compile(
    r'"tool_calls"\s*:\s*\[|"function"\s*:\s*\{\s*"name"\s*:\s*"[A-Za-z_]',
)

# Dangerous shell / SQL inside code-fenced blocks — only fires on code_gen consumers.
DANGEROUS_PYTHON_RE = re.compile(
    r"\b(?:os\.system|subprocess\.(?:call|run|Popen)|eval\s*\(|exec\s*\(|__import__\s*\("
    r"|open\s*\(\s*[\"'][^\"']*(?:/etc/passwd|/etc/shadow|\.ssh/|\.aws/|\.env)"
    r"|rm\s+-rf\s+[/~])",
)
DANGEROUS_SQL_RE = re.compile(
    r"\b(?:drop\s+(?:table|database|schema)|truncate\s+table|grant\s+all|delete\s+from\s+\w+\s*;)\b",
    re.IGNORECASE,
)

# Default allowlist for embedded image hosts (matches the engine's set).
DEFAULT_ALLOWED_IMG_HOSTS = {
    "github.com",
    "githubusercontent.com",
    "raw.githubusercontent.com",
    "user-images.githubusercontent.com",
    "githubassets.com",
    "imgur.com",
    "wikipedia.org",
    "wikimedia.org",
}


def _host(url: str) -> str:
    try:
        return urlparse(url).hostname.lower() if urlparse(url).hostname else ""
    except Exception:
        return ""


def _host_in_allowlist(host: str, allowed: Iterable[str]) -> bool:
    return any(host == a or host.endswith("." + a) for a in allowed)


# ----------------------------------------------------------------------------
# Public API
# ----------------------------------------------------------------------------


def scan(
    text: str,
    *,
    source: Source = "rag",
    allowed_image_hosts: Optional[Iterable[str]] = None,
    consumer: Optional[Literal["chat", "code_gen", "search"]] = None,
) -> list[Finding]:
    """Scan a single retrieved document for poisoning / injection signals.

    Args:
        text: The document body. Pass whatever you'd embed into your vector DB.
        source: Where the doc came from. Tightens severity for MCP/tool sources.
        allowed_image_hosts: Custom allowlist for markdown image URLs. Defaults
            to a conservative GitHub / Wikipedia / Imgur set (engine parity).
        consumer: The downstream consumer of this RAG content. If "code_gen",
            also fires the dangerous-shell / dangerous-SQL detectors.

    Returns:
        A list of ``Finding``, possibly empty. Sorted by severity descending
        (block > flag > info), then by rule name.
    """
    out: list[Finding] = []
    if not text:
        return out

    allowlist = set(allowed_image_hosts) if allowed_image_hosts else DEFAULT_ALLOWED_IMG_HOSTS

    # 1. Instruction-override addressed to the model.
    if RETRIEVED_OVERRIDE_RE.search(text):
        out.append(Finding(
            rule="retrieved_instruction_override",
            severity="block",
            reason=f"Override-style instruction inside retrieved content from {source}.",
            source=source,
        ))

    # 2. Imperative-to-model.
    if TO_MODEL_IMPERATIVE_RE.search(text):
        toolish = source in ("mcp_tool_desc", "mcp_tool_result")
        out.append(Finding(
            rule="retrieved_imperative_to_model",
            severity="block" if toolish else "flag",
            reason=f"Imperative addressed to the model from inside {source}.",
            source=source,
        ))

    # 3. Poisoned authority (ConfusedPilot signature).
    if RETRIEVED_AUTHORITY_RE.search(text):
        out.append(Finding(
            rule="retrieved_poisoned_authority",
            severity="block",
            reason="Document claims to supersede other sources — ConfusedPilot signature.",
            source=source,
        ))

    # 4. Markdown image exfil.
    for m in MD_IMAGE_RE.finditer(text):
        url = m.group(1) or ""
        host = _host(url)
        templated = bool(URL_TEMPLATE_RE.search(url))
        if templated or len(url) > 256 or (host and not _host_in_allowlist(host, allowlist)):
            why = (
                "templated URL (likely secret exfil)" if templated
                else "unknown host" if host else "URL > 256 chars"
            )
            out.append(Finding(
                rule="retrieved_markdown_image_exfil",
                severity="block",
                reason=f"Suspicious markdown image in {source}: {why}.",
                matched=m.group(0)[:120],
                source=source,
            ))
            break  # one is enough

    # 5. Hidden HTML containing instructions.
    if HIDDEN_CSS_RE.search(text):
        # Hidden styling alone is suspicious; combined with instruction-like
        # content it's block-grade. Mirror engine logic.
        is_instructional = (
            RETRIEVED_OVERRIDE_RE.search(text) is not None
            or TO_MODEL_IMPERATIVE_RE.search(text) is not None
        )
        out.append(Finding(
            rule="retrieved_hidden_html_instructions" if is_instructional else "retrieved_hidden_html",
            severity="block" if is_instructional else "flag",
            reason="Hidden HTML/CSS detected (display:none, white-on-white, off-screen, aria-hidden).",
            source=source,
        ))

    # 6. Zero-width / bidi-override smuggling.
    zw = ZERO_WIDTH_RE.findall(text)
    if len(zw) >= 3:  # 1-2 can be legit; 3+ is intentional smuggling
        out.append(Finding(
            rule="retrieved_zero_width_smuggling",
            severity="flag",
            reason=f"Contains {len(zw)} zero-width / bidi-override characters — likely smuggling.",
            source=source,
            metadata={"count": len(zw)},
        ))

    # 7. Fabricated tool-call JSON.
    if TOOL_CALL_JSON_RE.search(text):
        out.append(Finding(
            rule="retrieved_fake_tool_call",
            severity="flag",
            reason="Retrieved content contains tool_calls JSON — possible spoofed function call.",
            source=source,
        ))

    # 8. Dangerous shell / SQL — only when consumer is code_gen.
    if consumer == "code_gen":
        if DANGEROUS_PYTHON_RE.search(text):
            out.append(Finding(
                rule="retrieved_dangerous_python",
                severity="block",
                reason="Retrieved code contains dangerous Python (system calls, secret-file reads, eval).",
                source=source,
                layer="patterns",
            ))
        if DANGEROUS_SQL_RE.search(text):
            out.append(Finding(
                rule="retrieved_dangerous_sql",
                severity="block",
                reason="Retrieved content contains destructive SQL (DROP, TRUNCATE, GRANT ALL).",
                source=source,
                layer="patterns",
            ))

    out.sort(key=lambda f: ({"block": 0, "flag": 1, "info": 2}[f.severity], f.rule))
    return out


def scan_file(
    path: str | Path,
    *,
    source: Source = "rag",
    encoding: str = "utf-8",
    **kwargs,
) -> list[Finding]:
    """Scan a single file on disk. Returns the same shape as ``scan``."""
    p = Path(path)
    text = p.read_text(encoding=encoding, errors="replace")
    return scan(text, source=source, **kwargs)
