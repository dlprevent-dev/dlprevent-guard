"""CLI entry point — ``anveguard-rag``.

Designed to drop into data-ingest pipelines and CI. Exit codes:

    0   No findings, or only ``info`` findings.
    1   ``flag`` findings present and ``--fail-on flag`` set.
    2   ``block`` findings present and ``--fail-on block`` (default) set.
   64   Bad usage / invalid args.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .scanner import scan_file, scan, Finding, Source


def _gather(paths: list[str], recursive: bool, extensions: set[str]) -> list[Path]:
    out: list[Path] = []
    for raw in paths:
        p = Path(raw)
        if p.is_file():
            out.append(p)
            continue
        if p.is_dir() and recursive:
            for f in p.rglob("*"):
                if f.is_file() and (not extensions or f.suffix.lower() in extensions):
                    out.append(f)
        elif p.is_dir():
            for f in p.iterdir():
                if f.is_file() and (not extensions or f.suffix.lower() in extensions):
                    out.append(f)
    return out


def _print_human(results: list[tuple[str, list[Finding]]]) -> None:
    total_files = len(results)
    total_findings = sum(len(fs) for _, fs in results)
    blocks = sum(1 for _, fs in results for f in fs if f.severity == "block")
    flags = sum(1 for _, fs in results for f in fs if f.severity == "flag")
    for path, findings in results:
        if not findings:
            continue
        print(f"\n{path}")
        for f in findings:
            tag = {"block": "BLOCK", "flag": "FLAG ", "info": "INFO "}[f.severity]
            print(f"  [{tag}] {f.rule}")
            print(f"          {f.reason}")
            if f.matched:
                preview = f.matched.replace("\n", " ")[:100]
                print(f"          matched: {preview}")
    if total_findings == 0:
        print(f"clean — {total_files} file(s) scanned, 0 findings")
    else:
        print(f"\nscanned {total_files} file(s) — {blocks} block, {flags} flag, {total_findings} total")


def _print_json(results: list[tuple[str, list[Finding]]]) -> None:
    out = [
        {"path": path, "findings": [f.to_dict() for f in findings]}
        for path, findings in results
    ]
    json.dump(out, sys.stdout, indent=2)
    sys.stdout.write("\n")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(
        prog="anveguard-rag",
        description="Pre-ingest scanner — catch poisoned documents BEFORE they reach your vector DB.",
    )
    ap.add_argument("paths", nargs="+", help="Files or directories to scan.")
    ap.add_argument("--recursive", "-r", action="store_true", help="Recurse into directories.")
    ap.add_argument(
        "--ext", default=".md,.txt,.html,.htm,.rst,.json",
        help="Comma-separated extensions to scan when given a directory.",
    )
    ap.add_argument("--source", default="rag", choices=["rag", "scraped_html", "mcp_tool_result", "mcp_tool_desc", "email", "web"])
    ap.add_argument("--consumer", default=None, choices=["chat", "code_gen", "search"])
    ap.add_argument("--allowed-host", action="append", default=None, help="Add an allowed image host. Repeatable.")
    ap.add_argument("--json", action="store_true", help="Emit JSON instead of human-readable output.")
    ap.add_argument(
        "--fail-on", default="block", choices=["block", "flag", "none"],
        help="Set non-zero exit when findings at or above this severity exist.",
    )
    args = ap.parse_args(argv)

    extensions = {e.strip().lower() if e.strip().startswith(".") else f".{e.strip().lower()}" for e in args.ext.split(",") if e.strip()}
    files = _gather(args.paths, args.recursive, extensions)
    if not files:
        print("anveguard-rag: no files matched.", file=sys.stderr)
        return 64

    results: list[tuple[str, list[Finding]]] = []
    for f in files:
        findings = scan_file(
            f,
            source=args.source,  # type: ignore[arg-type]
            consumer=args.consumer,
            allowed_image_hosts=args.allowed_host,
        )
        results.append((str(f), findings))

    if args.json:
        _print_json(results)
    else:
        _print_human(results)

    has_block = any(f.severity == "block" for _, fs in results for f in fs)
    has_flag = any(f.severity == "flag" for _, fs in results for f in fs)
    if args.fail_on == "block" and has_block:
        return 2
    if args.fail_on == "flag" and (has_block or has_flag):
        return 1
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
