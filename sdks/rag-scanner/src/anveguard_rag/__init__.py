"""AnveGuard pre-ingest RAG scanner.

Scans documents BEFORE they enter your vector database. Catches the class
of attacks that get past runtime guardrails because they live inside the
retrieved chunk, not the user prompt — ConfusedPilot-style poisoned
authority claims, instructions hidden in white-on-white HTML, zero-width
character smuggling, fake tool-call JSON, markdown-image exfil URLs, and
direct "ignore previous instructions" attempts addressed to the model
from inside the data.

Python port of AnveGuard's ``evaluateRetrieved`` detector set. Runs
locally, no network, fast enough for batch ingest of millions of docs.

Quickstart
----------
    from anveguard_rag import scan, Finding

    findings = scan(open("policy.md").read(), source="rag")
    for f in findings:
        print(f.rule, f.severity, f.reason)

CLI
---
    anveguard-rag policy.md
    anveguard-rag --recursive docs/ --json
    anveguard-rag --fail-on block ingest/ --exit-code-on-finding 2
"""

from .scanner import scan, scan_file, Finding, Severity, Source

__all__ = ["scan", "scan_file", "Finding", "Severity", "Source"]
__version__ = "0.1.0"
