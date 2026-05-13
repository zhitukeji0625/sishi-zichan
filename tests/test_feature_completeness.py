"""
功能完整性：校验对外公开的 API、模块可导入且核心路径可运行。
"""

import importlib

import pytest

from sishi_zichan import Asset, AssetStore, __all__, __version__


REQUIRED_MODULES = ("sishi_zichan", "sishi_zichan.assets")


def test_required_modules_importable():
    for name in REQUIRED_MODULES:
        mod = importlib.import_module(name)
        assert mod.__name__ == name


def test_public_api_exports():
    assert "Asset" in __all__
    assert "AssetStore" in __all__


def test_version_is_semver_like():
    assert isinstance(__version__, str)
    parts = __version__.split(".")
    assert len(parts) >= 2
    assert all(p.isdigit() for p in parts[:2])


def test_asset_store_lifecycle():
    store = AssetStore()
    asset = store.add("a1", "现金")
    assert store.get("a1") == asset
    assert len(store.list_all()) == 1
    with pytest.raises(ValueError, match="duplicate"):
        store.add("a1", "重复")
