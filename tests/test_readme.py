"""Smoke tests: repository metadata and layout."""

import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent


class TestRepositoryLayout(unittest.TestCase):
    def test_readme_exists_and_nonempty(self) -> None:
        readme = REPO_ROOT / "README.md"
        self.assertTrue(readme.is_file(), "README.md must exist")
        self.assertGreater(readme.stat().st_size, 0, "README.md must not be empty")

    def test_readme_contains_project_name(self) -> None:
        text = (REPO_ROOT / "README.md").read_text(encoding="utf-8")
        self.assertIn("sishi-zichan", text)


if __name__ == "__main__":
    unittest.main()
