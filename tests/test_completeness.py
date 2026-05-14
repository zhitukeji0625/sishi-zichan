"""功能完整性：对外 API、版本与关键行为必须可用。"""

import importlib

import pytest

import sishi_zichan


def test_package_version_is_semantic_string() -> None:
    v = getattr(sishi_zichan, "__version__", None)
    assert isinstance(v, str) and len(v) > 0
    parts = v.split(".")
    assert len(parts) >= 2


def test_public_exports_match_all() -> None:
    expected = {"Asset", "AssetStore", "__version__"}
    assert set(sishi_zichan.__all__) == expected


def test_asset_store_crud_roundtrip() -> None:
    store = sishi_zichan.AssetStore()
    a = store.create("测试资产", value=100.0)
    assert a.id
    assert store.get(a.id) is not None
    updated = store.update(a.id, name="已更名", value=200.0)
    assert updated is not None
    assert updated.name == "已更名" and updated.value == 200.0
    assert store.delete(a.id) is True
    assert store.get(a.id) is None


@pytest.mark.parametrize("name", ["sishi_zichan", "sishi_zichan.assets"])
def test_submodules_importable(name: str) -> None:
    importlib.import_module(name)
