"""仓库基础完整性检查（标准库 unittest，无需额外依赖）。"""

import unittest
from pathlib import Path


class TestRepoIntegrity(unittest.TestCase):
    def test_readme_exists(self) -> None:
        root = Path(__file__).resolve().parent.parent
        readme = root / "README.md"
        self.assertTrue(readme.is_file(), "README.md 应存在")

    def test_readme_has_project_title(self) -> None:
        root = Path(__file__).resolve().parent.parent
        text = (root / "README.md").read_text(encoding="utf-8")
        self.assertIn("# sishi-zichan", text.strip().splitlines()[0])


if __name__ == "__main__":
    unittest.main()
