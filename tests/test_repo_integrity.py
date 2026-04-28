"""仓库与文档完整性检查。"""
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent


def test_readme_exists_and_has_title():
    readme = REPO_ROOT / "README.md"
    assert readme.is_file(), "README.md 应存在"
    text = readme.read_text(encoding="utf-8").strip()
    assert text.startswith("#"), "README 应以一级标题开头"


def test_gitignore_or_pytest_config_optional():
    """占位：若日后加入 .gitignore / pytest.ini，可在此扩展断言。"""
    assert REPO_ROOT.is_dir()
