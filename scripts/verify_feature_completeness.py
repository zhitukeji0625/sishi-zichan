#!/usr/bin/env python3
"""Minimal feature-completeness gate for repository bootstrap projects."""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
README = ROOT / "README.md"
MIN_DESC_LEN = 20


def main() -> int:
    if not README.is_file():
        print("FAIL: README.md is missing", file=sys.stderr)
        return 1
    text = README.read_text(encoding="utf-8").strip()
    if not text:
        print("FAIL: README.md is empty", file=sys.stderr)
        return 1
    if not re.match(r"^#\s+\S", text, re.MULTILINE):
        print("FAIL: README must start with a Markdown H1 title (# ...)", file=sys.stderr)
        return 1
    lines = [ln.strip() for ln in text.splitlines()]
    body = [ln for ln in lines[1:] if ln]
    desc = " ".join(body)
    if len(desc) < MIN_DESC_LEN:
        print(
            f"FAIL: README needs a project description after the title "
            f"(at least {MIN_DESC_LEN} non-whitespace characters in body).",
            file=sys.stderr,
        )
        return 1
    print("OK: feature completeness checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
