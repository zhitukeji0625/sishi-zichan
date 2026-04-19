"""功能完整性：覆盖对外 API 与主要校验规则。"""

import pytest

from sishi_zichan import AssetNotFoundError, AssetStore, __version__


def test_package_version_exported() -> None:
    assert isinstance(__version__, str)
    assert __version__


def test_create_list_get_roundtrip() -> None:
    store = AssetStore()
    a = store.create("笔记本", value_cents=5000, tags=["办公"])
    assert a.id
    assert a.name == "笔记本"
    assert a.value_cents == 5000
    assert a.tags == ["办公"]

    items = store.list()
    assert len(items) == 1
    assert store.get(a.id).name == "笔记本"


def test_update_partial_fields() -> None:
    store = AssetStore()
    a = store.create("椅子", value_cents=10000)
    updated = store.update(a.id, name=" 人体工学椅 ", value_cents=20000)
    assert updated.name == "人体工学椅"
    assert updated.value_cents == 20000

    store.update(a.id, tags=["家具", "人体工学"])
    assert store.get(a.id).tags == ["家具", "人体工学"]


def test_delete_removes_asset() -> None:
    store = AssetStore()
    a = store.create("显示器")
    store.delete(a.id)
    assert store.count() == 0
    with pytest.raises(AssetNotFoundError):
        store.get(a.id)


def test_get_delete_missing_raises() -> None:
    store = AssetStore()
    with pytest.raises(AssetNotFoundError):
        store.get("00000000-0000-0000-0000-000000000000")
    with pytest.raises(AssetNotFoundError):
        store.delete("00000000-0000-0000-0000-000000000000")


def test_create_validation() -> None:
    store = AssetStore()
    with pytest.raises(ValueError):
        store.create("")
    with pytest.raises(ValueError):
        store.create("   ")
    with pytest.raises(ValueError):
        store.create("x", value_cents=-1)


def test_update_validation() -> None:
    store = AssetStore()
    a = store.create("键盘")
    with pytest.raises(ValueError):
        store.update(a.id, name="")
    with pytest.raises(ValueError):
        store.update(a.id, value_cents=-5)
