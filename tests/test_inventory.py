import pytest

from sishi_zichan import Asset, Inventory, __version__


def test_version_exported() -> None:
    assert __version__
    assert isinstance(__version__, str)


def test_asset_valid() -> None:
    a = Asset("a1", "设备", 100)
    assert a.asset_id == "a1"
    assert a.value_cents == 100


@pytest.mark.parametrize(
    "kwargs",
    [
        {"asset_id": "", "name": "x", "value_cents": 0},
        {"asset_id": "   ", "name": "x", "value_cents": 0},
        {"asset_id": "id", "name": "", "value_cents": 0},
        {"asset_id": "id", "name": "  ", "value_cents": 0},
        {"asset_id": "id", "name": "x", "value_cents": -1},
    ],
)
def test_asset_invalid(kwargs: dict) -> None:
    with pytest.raises(ValueError):
        Asset(**kwargs)


def test_inventory_add_get_remove() -> None:
    inv = Inventory()
    inv.add(Asset("1", "A", 50))
    assert len(inv) == 1
    assert inv.get("1").name == "A"
    removed = inv.remove("1")
    assert removed.name == "A"
    assert len(inv) == 0


def test_inventory_duplicate_add_raises() -> None:
    inv = Inventory()
    inv.add(Asset("1", "A", 10))
    with pytest.raises(KeyError):
        inv.add(Asset("1", "B", 20))


def test_inventory_get_missing_raises() -> None:
    inv = Inventory()
    with pytest.raises(KeyError):
        inv.get("missing")


def test_inventory_remove_missing_raises() -> None:
    inv = Inventory()
    with pytest.raises(KeyError):
        inv.remove("missing")


def test_inventory_total_value() -> None:
    inv = Inventory()
    inv.add(Asset("a", "x", 100))
    inv.add(Asset("b", "y", 250))
    assert inv.total_value_cents() == 350


def test_inventory_iter() -> None:
    inv = Inventory()
    inv.add(Asset("a", "x", 1))
    inv.add(Asset("b", "y", 2))
    ids = {x.asset_id for x in inv}
    assert ids == {"a", "b"}
