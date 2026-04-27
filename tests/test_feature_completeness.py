"""仓库与导出 API 的功能完整性检查。"""

from pathlib import Path

import sishi_zichan


def test_package_exports_expected_symbols():
    assert hasattr(sishi_zichan, "normalize_asset_name")
    assert hasattr(sishi_zichan, "validate_asset_code")
    assert hasattr(sishi_zichan, "__version__")
    assert isinstance(sishi_zichan.__version__, str)
    assert sishi_zichan.__version__


def test_readme_exists_and_has_substance():
    root = Path(__file__).resolve().parents[1]
    readme = root / "README.md"
    assert readme.is_file()
    text = readme.read_text(encoding="utf-8").strip()
    assert len(text) >= 3
