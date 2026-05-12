"""Repository functional completeness checks."""

from __future__ import annotations

import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent


class TestRepositoryCompleteness(unittest.TestCase):
    def test_readme_exists(self) -> None:
        readme = REPO_ROOT / "README.md"
        self.assertTrue(readme.is_file(), "README.md must exist at repository root")

    def test_readme_has_substance(self) -> None:
        readme = REPO_ROOT / "README.md"
        text = readme.read_text(encoding="utf-8").strip()
        self.assertGreater(len(text), 0, "README.md must not be empty")


if __name__ == "__main__":
    unittest.main()
