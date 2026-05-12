"""仓库基础完整性自检（无第三方依赖）。"""

import unittest
from pathlib import Path


class TestRepoSmoke(unittest.TestCase):
    def test_readme_exists(self) -> None:
        readme = Path(__file__).resolve().parent.parent / "README.md"
        self.assertTrue(readme.is_file(), "README.md 应存在")

    def test_readme_non_empty(self) -> None:
        readme = Path(__file__).resolve().parent.parent / "README.md"
        text = readme.read_text(encoding="utf-8").strip()
        self.assertGreater(len(text), 0, "README.md 不应为空")


if __name__ == "__main__":
    unittest.main()
