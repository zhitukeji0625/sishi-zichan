import pytest

from sishi_zichan.inventory import AssetStore


def test_add_and_list() -> None:
    store = AssetStore()
    a = store.add("现金", 100.0)
    assert a.name == "现金"
    assert a.value == 100.0
    assert len(store.list_all()) == 1


def test_total_value() -> None:
    store = AssetStore()
    store.add("A", 10)
    store.add("B", 20.5)
    assert store.total_value() == pytest.approx(30.5)


def test_reject_empty_name() -> None:
    store = AssetStore()
    with pytest.raises(ValueError, match="名称"):
        store.add("", 1)


def test_reject_negative_value() -> None:
    store = AssetStore()
    with pytest.raises(ValueError, match="负数"):
        store.add("x", -1)


def test_meta_passthrough() -> None:
    store = AssetStore()
    a = store.add("房产", 0, city="上海")
    assert a.meta["city"] == "上海"
