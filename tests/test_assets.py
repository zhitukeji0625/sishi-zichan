from decimal import Decimal

import pytest

from sishi_zichan import Asset, AssetStore


def test_add_and_get() -> None:
    store = AssetStore()
    a = Asset("1", "cash", Decimal("100.50"))
    store.add(a)
    assert store.get("1") == a


def test_duplicate_id_raises() -> None:
    store = AssetStore()
    store.add(Asset("x", "a", Decimal("1")))
    with pytest.raises(ValueError, match="duplicate"):
        store.add(Asset("x", "b", Decimal("2")))


def test_total_value_empty() -> None:
    assert AssetStore().total_value() == Decimal("0")


def test_total_value_sums() -> None:
    store = AssetStore()
    store.add(Asset("a", "one", Decimal("10")))
    store.add(Asset("b", "two", Decimal("20.5")))
    assert store.total_value() == Decimal("30.5")


def test_list_all_order_not_guaranteed_but_contains() -> None:
    store = AssetStore()
    store.add(Asset("z", "last", Decimal("1")))
    store.add(Asset("a", "first", Decimal("2")))
    ids = {x.id for x in store.list_all()}
    assert ids == {"z", "a"}
