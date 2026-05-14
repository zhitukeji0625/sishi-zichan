"""功能完整性：包可安装、核心 API 可用、元数据一致。"""

from pathlib import Path

import sishi_zichan


def test_package_version_matches_metadata() -> None:
    import tomllib

    root = Path(__file__).resolve().parents[1]
    data = tomllib.loads((root / "pyproject.toml").read_text(encoding="utf-8"))
    declared = data["project"]["version"]
    assert sishi_zichan.__version__ == declared


def test_health_contract() -> None:
    payload = sishi_zichan.health()
    assert payload["status"] == "ok"
    assert payload["version"] == sishi_zichan.__version__


def test_readme_exists() -> None:
    root = Path(__file__).resolve().parents[1]
    assert (root / "README.md").is_file()
