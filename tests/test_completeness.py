"""功能完整性：公开 API、生命周期与错误语义。"""

import importlib

import pytest

import sishi_zichan
from sishi_zichan import Asset, AssetExistsError, AssetNotFoundError, AssetRegistry


def test_public_api_surface_complete():
    """包 __all__ 中的符号均可导入且为预期类型。"""
    expected = {
        "Asset": Asset,
        "AssetExistsError": AssetExistsError,
        "AssetNotFoundError": AssetNotFoundError,
        "AssetRegistry": AssetRegistry,
    }
    for name in sishi_zichan.__all__:
        assert hasattr(sishi_zichan, name), f"missing export: {name}"
        obj = getattr(sishi_zichan, name)
        assert obj is expected[name]

    mod = importlib.reload(sishi_zichan)
    exports = set(mod.__all__)
    assert exports == set(expected.keys())


def test_asset_registry_full_lifecycle():
    reg = AssetRegistry()
    a = Asset(asset_id="x1", name="现金", value=100.0)
    reg.register(a)
    assert len(reg) == 1
    assert reg.get("x1") == a
    assert list(reg) == [a]

    b = Asset(asset_id="x1", name="现金", value=150.0)
    reg.update(b)
    assert reg.get("x1").value == 150.0

    reg.remove("x1")
    assert len(reg) == 0


def test_register_duplicate_raises():
    reg = AssetRegistry()
    a = Asset(asset_id="d", name="重复", value=1.0)
    reg.register(a)
    with pytest.raises(AssetExistsError):
        reg.register(a)


def test_get_missing_raises():
    reg = AssetRegistry()
    with pytest.raises(AssetNotFoundError):
        reg.get("none")


def test_update_missing_raises():
    reg = AssetRegistry()
    a = Asset(asset_id="u", name="仅更新", value=2.0)
    with pytest.raises(AssetNotFoundError):
        reg.update(a)


def test_remove_missing_raises():
    reg = AssetRegistry()
    with pytest.raises(AssetNotFoundError):
        reg.remove("gone")


def test_errors_are_typed_correctly():
    assert issubclass(AssetNotFoundError, KeyError)
    assert issubclass(AssetExistsError, ValueError)


def test_asset_is_frozen_dataclass():
    a = Asset(asset_id="f", name="冻结", value=0.0)
    with pytest.raises(Exception):
        a.name = "改不了"
