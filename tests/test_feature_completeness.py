"""功能完整性：公共 API 存在、可导入且行为符合约定。"""

import importlib

import pytest

import sishi_zichan
from sishi_zichan import __all__ as public_names
from sishi_zichan import calculate_total_value, normalize_asset_id


def test_package_exports_match_implementation():
    """__all__ 中的符号均可从包根导入。"""
    for name in public_names:
        assert hasattr(sishi_zichan, name), f"缺少导出: {name}"


def test_normalize_asset_id_basic():
    assert normalize_asset_id("  ab-12  ") == "AB-12"


def test_normalize_asset_id_rejects_empty():
    with pytest.raises(ValueError, match="不能为空"):
        normalize_asset_id("   ")


def test_normalize_asset_id_rejects_none():
    with pytest.raises(TypeError, match="不能为 None"):
        normalize_asset_id(None)  # type: ignore[arg-type]


def test_calculate_total_value_sums():
    assert calculate_total_value([("A", 10.5), ("B", 0.5)]) == 11.0


def test_calculate_total_value_rejects_negative():
    with pytest.raises(ValueError, match="不能为负数"):
        calculate_total_value([("X", -1.0)])


def test_module_reload_idempotent():
    """重复加载不产生破坏性副作用（基础完整性）。"""
    importlib.reload(sishi_zichan)
    assert sishi_zichan.__version__
