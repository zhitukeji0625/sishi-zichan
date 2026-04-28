"""仓库与文档完整性检查。"""
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent


class TestRepoIntegrity(unittest.TestCase):
    def test_readme_exists(self):
        readme = REPO_ROOT / "README.md"
        self.assertTrue(
            readme.is_file(),
            "README.md 应存在",
        )

    def test_readme_has_title(self):
        text = (REPO_ROOT / "README.md").read_text(encoding="utf-8")
        self.assertIn("#", text.strip(), "README 应包含 Markdown 标题")
        self.assertGreater(len(text.strip()), 0, "README 不应为空")


if __name__ == "__main__":
    unittest.main()
