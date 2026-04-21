"""仓库与包的基础完整性测试。"""

from pathlib import Path

import sishi_zichan


def test_readme_exists_and_nonempty() -> None:
    root = Path(__file__).resolve().parents[1]
    readme = root / "README.md"
    assert readme.is_file()
    text = readme.read_text(encoding="utf-8").strip()
    assert len(text) > 0


def test_package_metadata() -> None:
    assert sishi_zichan.project_slug() == "sishi-zichan"
    assert sishi_zichan.version() == "0.1.0"
