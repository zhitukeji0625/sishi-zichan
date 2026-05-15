"""仓库基本完整性检查：在尚无业务代码时验证文档与结构。"""
import unittest
from pathlib import Path


class TestReadme(unittest.TestCase):
    def test_readme_exists_and_has_project_title(self):
        root = Path(__file__).resolve().parents[1]
        readme = root / "README.md"
        self.assertTrue(readme.is_file(), "README.md 应存在")
        text = readme.read_text(encoding="utf-8")
        self.assertIn("# sishi-zichan", text, "README 应包含项目标题")


if __name__ == "__main__":
    unittest.main()
