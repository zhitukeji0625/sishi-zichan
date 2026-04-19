#!/usr/bin/env python3
"""CLI entrypoint for feature completeness checks (usable in CI)."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path


def main() -> int:
    repo_root = Path(__file__).resolve().parents[1]
    tests_dir = repo_root / "tests"
    suite = unittest.defaultTestLoader.discover(
        str(tests_dir),
        pattern="test_*.py",
        top_level_dir=str(repo_root),
    )
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    sys.exit(main())
