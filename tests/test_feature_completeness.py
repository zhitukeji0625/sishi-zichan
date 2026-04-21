"""功能完整性：仓库应具备的最小可维护性与文档约定。"""

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]


def test_readme_exists():
    assert (REPO_ROOT / "README.md").is_file(), "项目根目录应有 README.md"


def test_readme_has_project_identity():
    text = (REPO_ROOT / "README.md").read_text(encoding="utf-8")
    assert "sishi-zichan" in text
    assert len(text.strip()) >= 40, "README 应包含简短项目说明，便于协作与发布"


def test_pyproject_declares_project():
    pyproject = REPO_ROOT / "pyproject.toml"
    assert pyproject.is_file()
    content = pyproject.read_text(encoding="utf-8")
    assert 'name = "sishi-zichan"' in content
    assert "pytest" in content.lower()


def test_tests_package_present():
    assert (REPO_ROOT / "tests").is_dir()
    assert (REPO_ROOT / "tests" / "test_feature_completeness.py").is_file()
