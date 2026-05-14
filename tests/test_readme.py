"""仓库基础完整性：文档存在且包含项目标识。"""
import unittest
from pathlib import Path


class TestRepositoryIntegrity(unittest.TestCase):
    def test_readme_exists_and_has_title(self) -> None:
        root = Path(__file__).resolve().parent.parent
        readme = root / "README.md"
        self.assertTrue(readme.is_file(), "README.md 应存在")
        text = readme.read_text(encoding="utf-8")
        self.assertIn("sishi-zichan", text, "README 应包含项目名称")


if __name__ == "__main__":
    unittest.main()
