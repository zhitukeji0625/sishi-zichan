"""仓库基础完整性检查（标准库 unittest，无第三方依赖）。"""

import unittest
from pathlib import Path


class TestRepositoryBasics(unittest.TestCase):
    def test_readme_exists_and_nonempty(self):
        root = Path(__file__).resolve().parent.parent
        readme = root / "README.md"
        self.assertTrue(readme.is_file(), "README.md 应存在")
        text = readme.read_text(encoding="utf-8").strip()
        self.assertGreater(len(text), 0, "README.md 不应为空")


if __name__ == "__main__":
    unittest.main()
