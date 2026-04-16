"""项目元信息与仓库内一致性检查。"""

from __future__ import annotations

from pathlib import Path

EXPECTED_PROJECT_SLUG = "sishi-zichan"


def repo_root() -> Path:
    """返回仓库根目录（包含 README.md 的目录）。"""
    return Path(__file__).resolve().parent.parent


def get_project_info() -> dict[str, str | bool]:
    """返回与仓库状态相关的基本信息，供集成测试与脚本使用。"""
    root = repo_root()
    readme = root / "README.md"
    title = ""
    if readme.is_file():
        first = readme.read_text(encoding="utf-8").strip().splitlines()
        title = first[0].lstrip("# ").strip() if first else ""

    return {
        "slug": EXPECTED_PROJECT_SLUG,
        "readme_exists": readme.is_file(),
        "readme_title": title,
    }
