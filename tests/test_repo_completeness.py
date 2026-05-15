"""Repository deliverable checks (stdlib only)."""

import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]


class TestRepoCompleteness(unittest.TestCase):
    def test_readme_exists(self) -> None:
        readme = REPO_ROOT / "README.md"
        self.assertTrue(
            readme.is_file(),
            "README.md must exist at repository root",
        )

    def test_readme_has_project_title(self) -> None:
        text = (REPO_ROOT / "README.md").read_text(encoding="utf-8")
        self.assertIn(
            "# sishi-zichan",
            text,
            "README must document the project title",
        )
        self.assertGreater(len(text.strip()), len("# sishi-zichan"), "README should not be title-only")


if __name__ == "__main__":
    unittest.main()
