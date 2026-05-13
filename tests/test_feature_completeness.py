"""功能完整性：对外 API 与核心行为必须可用。"""

import pytest

import sishi_zichan
from sishi_zichan import (
    Asset,
    create_asset,
    delete_asset,
    get_asset,
    list_assets,
)
from sishi_zichan.assets import reset_registry


@pytest.fixture(autouse=True)
def _clean_registry():
    reset_registry()
    yield
    reset_registry()


def test_public_api_exports():
    """包级 __all__ 与文档化导出一致。"""
    expected = {"Asset", "create_asset", "delete_asset", "get_asset", "list_assets"}
    assert set(sishi_zichan.__all__) == expected
    for name in expected:
        assert hasattr(sishi_zichan, name)


def test_create_list_get_roundtrip():
    a = create_asset("  现金  ", 100.0)
    assert isinstance(a, Asset)
    assert a.name == "现金"
    assert a.value == 100.0
    assert get_asset(a.id) == a
    assert list_assets() == [a]


def test_delete_removes_asset():
    a = create_asset("设备", 0.0)
    delete_asset(a.id)
    with pytest.raises(KeyError):
        get_asset(a.id)
    assert list_assets() == []


def test_validation_empty_name():
    with pytest.raises(ValueError, match="名称"):
        create_asset("", 1)


def test_validation_negative_value():
    with pytest.raises(ValueError, match="负数"):
        create_asset("负债项", -0.01)
