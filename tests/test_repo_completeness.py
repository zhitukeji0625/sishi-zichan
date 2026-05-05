"""仓库与文档层面的功能完整性检查。"""

from pathlib import Path
import unittest


REPO_ROOT = Path(__file__).resolve().parents[1]


class TestRepoCompleteness(unittest.TestCase):
    """确保关键工件存在且内容有效。"""

    def test_readme_exists(self) -> None:
        path = REPO_ROOT / "README.md"
        self.assertTrue(path.is_file(), "README.md 必须存在")

    def test_readme_non_empty(self) -> None:
        text = (REPO_ROOT / "README.md").read_text(encoding="utf-8")
        stripped = text.strip()
        self.assertGreater(len(stripped), 0, "README.md 不能为空")

    def test_readme_has_project_heading(self) -> None:
        text = (REPO_ROOT / "README.md").read_text(encoding="utf-8")
        lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
        self.assertTrue(lines, "README 至少应有一行非空内容")
        self.assertTrue(
            lines[0].startswith("#"),
            "README 首条非空行应为 Markdown 标题（以 # 开头）",
        )
        self.assertIn(
            "sishi",
            lines[0].lower(),
            "项目标题应包含仓库标识 sishi",
        )


if __name__ == "__main__":
    unittest.main()
