"""仓库基础完整性检查。"""
import unittest
from pathlib import Path


class TestRepoSanity(unittest.TestCase):
    """确保仓库具备预期最小结构。"""

    def test_readme_exists(self):
        root = Path(__file__).resolve().parent.parent
        readme = root / "README.md"
        self.assertTrue(
            readme.is_file(),
            "README.md 应存在",
        )

    def test_readme_has_title(self):
        root = Path(__file__).resolve().parent.parent
        text = (root / "README.md").read_text(encoding="utf-8")
        self.assertIn("#", text.strip(), "README 应包含标题标记")


if __name__ == "__main__":
    unittest.main()
