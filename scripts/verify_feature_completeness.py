#!/usr/bin/env python3
"""Verify that the repository contains required artifacts for feature completeness."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# Paths relative to repository root that must exist for a minimal complete setup.
REQUIRED_FILES: tuple[str, ...] = (
    "README.md",
    "scripts/verify_feature_completeness.py",
    ".gitignore",
)

# Substrings that must appear in README.md (documentation completeness).
REQUIRED_README_MARKERS: tuple[str, ...] = (
    "sishi-zichan",
    "功能完整性",
)


def main() -> int:
    failed = False
    for rel in REQUIRED_FILES:
        path = ROOT / rel
        if not path.is_file():
            print(f"MISSING: {rel}", file=sys.stderr)
            failed = True

    readme = ROOT / "README.md"
    if readme.is_file():
        text = readme.read_text(encoding="utf-8", errors="replace")
        for marker in REQUIRED_README_MARKERS:
            if marker not in text:
                print(f"README.md 缺少必要内容: {marker!r}", file=sys.stderr)
                failed = True

    if failed:
        print("功能完整性检查未通过。", file=sys.stderr)
        return 1
    print("功能完整性检查通过。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
