"""仓库结构与文档完整性检查。"""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_readme_exists():
    assert (ROOT / "README.md").is_file()


def test_readme_contains_project_name():
    text = (ROOT / "README.md").read_text(encoding="utf-8")
    assert "sishi-zichan" in text
