"""仓库基本完整性检查。"""
import pathlib
import unittest


class TestRepositoryIntegrity(unittest.TestCase):
    def test_readme_exists_and_has_title(self) -> None:
        root = pathlib.Path(__file__).resolve().parent.parent
        readme = root / "README.md"
        self.assertTrue(readme.is_file(), "README.md 应存在")
        text = readme.read_text(encoding="utf-8").strip()
        self.assertTrue(len(text) > 0, "README.md 不应为空")
        self.assertIn("sishi", text.lower())


if __name__ == "__main__":
    unittest.main()
