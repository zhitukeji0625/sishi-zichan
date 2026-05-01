"""项目基线完整性：仓库布局与 README 约定。"""
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class TestProjectBaseline(unittest.TestCase):
    def test_readme_exists(self):
        readme = ROOT / "README.md"
        self.assertTrue(
            readme.is_file(),
            "README.md 应存在于仓库根目录",
        )

    def test_readme_has_project_title(self):
        text = (ROOT / "README.md").read_text(encoding="utf-8")
        self.assertIn(
            "sishi-zichan",
            text,
            "README 应包含项目名称",
        )


if __name__ == "__main__":
    unittest.main()
