"""仓库与文档层面的功能完整性检查。"""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
README = ROOT / "README.md"


def test_readme_exists():
    assert README.is_file(), "项目根目录应有 README.md"


def test_readme_has_title():
    text = README.read_text(encoding="utf-8")
    assert "# sishi-zichan" in text, "README 应包含项目标题"


def test_readme_has_intro():
    text = README.read_text(encoding="utf-8")
    assert "## 简介" in text, "README 应包含「简介」小节"


def test_readme_has_features():
    text = README.read_text(encoding="utf-8")
    assert "## 功能" in text, "README 应包含「功能」小节"


def test_readme_has_dev_section():
    text = README.read_text(encoding="utf-8")
    assert "## 开发与测试" in text, "README 应包含「开发与测试」小节"


def test_ci_workflow_present():
    workflow = ROOT / ".github" / "workflows" / "ci.yml"
    assert workflow.is_file(), "应存在 GitHub Actions CI 工作流 .github/workflows/ci.yml"
