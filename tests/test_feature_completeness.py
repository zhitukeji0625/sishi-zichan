"""功能完整性：对外 API 与约定必须稳定可用。"""

import importlib

import pytest

REQUIRED_EXPORTS = frozenset({"Asset", "Portfolio", "__version__"})


def test_package_exports_complete() -> None:
    pkg = importlib.import_module("sishi_zichan")
    missing = REQUIRED_EXPORTS - set(dir(pkg))
    assert not missing, f"缺少对外导出: {sorted(missing)}"


def test_version_is_non_empty_string() -> None:
    import sishi_zichan as sz

    assert isinstance(sz.__version__, str)
    assert sz.__version__.strip()


def test_portfolio_aggregation_surface() -> None:
    """组合必须提供汇总与规模查询（功能面完整）。"""
    import sishi_zichan as sz

    p = sz.Portfolio(
        (
            sz.Asset("现金", 100.0),
            sz.Asset("存款", 50.5),
        )
    )
    assert hasattr(p, "total_value")
    assert hasattr(p, "asset_count")
    assert p.total_value() == pytest.approx(150.5)
    assert p.asset_count() == 2


def test_asset_validation_contract() -> None:
    import sishi_zichan as sz

    with pytest.raises(ValueError, match="名称"):
        sz.Asset("  ", 1.0)
    with pytest.raises(ValueError, match="负数"):
        sz.Asset("负债项", -0.01)
