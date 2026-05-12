"""仓库基础完整性检查（无第三方依赖，使用 unittest）。"""

import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent


class TestRepoCompleteness(unittest.TestCase):
    def test_readme_exists(self):
        readme = REPO_ROOT / "README.md"
        self.assertTrue(readme.is_file(), "README.md 应存在")

    def test_readme_non_empty(self):
        text = (REPO_ROOT / "README.md").read_text(encoding="utf-8").strip()
        self.assertTrue(len(text) > 0, "README.md 不应为空")

    def test_readme_has_project_title(self):
        text = (REPO_ROOT / "README.md").read_text(encoding="utf-8")
        self.assertIn("sishi-zichan", text, "README 应包含项目名称")


if __name__ == "__main__":
    unittest.main()
