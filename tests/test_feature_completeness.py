"""Repository feature completeness checks."""

from __future__ import annotations

import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]

# Baseline contract for this repository; extend as features land.
REQUIRED_PATHS: tuple[str, ...] = (
    "README.md",
)


class TestFeatureCompleteness(unittest.TestCase):
    def test_required_paths_exist(self) -> None:
        missing = [p for p in REQUIRED_PATHS if not (REPO_ROOT / p).is_file()]
        self.assertEqual(
            missing,
            [],
            f"Missing required files or directories: {missing}",
        )

    def test_readme_documents_project(self) -> None:
        readme = REPO_ROOT / "README.md"
        text = readme.read_text(encoding="utf-8")
        self.assertTrue(text.strip(), "README must not be empty")
        lowered = text.lower()
        self.assertIn(
            "sishi",
            lowered,
            "README should identify the sishi-zichan project",
        )


if __name__ == "__main__":
    unittest.main()
