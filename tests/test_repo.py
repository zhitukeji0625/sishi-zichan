"""Smoke tests: repository layout and documented basics."""

import unittest
from pathlib import Path


class TestRepositoryLayout(unittest.TestCase):
    """Ensure expected files exist so the project is minimally complete."""

    def setUp(self):
        self.root = Path(__file__).resolve().parent.parent

    def test_readme_exists(self):
        readme = self.root / "README.md"
        self.assertTrue(readme.is_file(), "README.md must exist")

    def test_readme_has_title(self):
        text = (self.root / "README.md").read_text(encoding="utf-8")
        self.assertIn("sishi-zichan", text)


if __name__ == "__main__":
    unittest.main()
