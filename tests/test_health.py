"""仓库与核心模块的完整性测试。"""

from pathlib import Path

import pytest

from sishi_zichan import __version__, health


def test_health_returns_ok_status() -> None:
    payload = health()
    assert payload["status"] == "ok"
    assert "component" in payload


def test_version_is_non_empty_semver_like() -> None:
    parts = __version__.split(".")
    assert len(parts) >= 2
    assert all(p.isdigit() for p in parts[:2])


@pytest.mark.parametrize(
    "relative",
    ["README.md", "pyproject.toml", "src/sishi_zichan/__init__.py"],
)
def test_required_repo_files_exist(relative: str) -> None:
    root = Path(__file__).resolve().parents[1]
    assert (root / relative).is_file(), f"missing: {relative}"
