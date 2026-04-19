import pytest

from sishi_zichan import Asset, Inventory, __version__


def test_version_is_semantic_string() -> None:
    parts = __version__.split(".")
    assert len(parts) >= 2
    assert all(p.isdigit() for p in parts[:2])


def test_inventory_upsert_get_list_total() -> None:
    inv = Inventory()
    inv.upsert(Asset("a1", "现金", 100))
    inv.upsert(Asset("b2", "股票", 500))
    assert len(inv) == 2
    assert inv.get("a1") == Asset("a1", "现金", 100)
    assert [a.asset_id for a in inv.list_all()] == ["a1", "b2"]
    assert inv.total_value_cents() == 600


def test_upsert_replaces_same_id() -> None:
    inv = Inventory()
    inv.upsert(Asset("x", "旧", 10))
    inv.upsert(Asset("x", "新", 20))
    assert inv.get("x") == Asset("x", "新", 20)
    assert len(inv) == 1


def test_remove() -> None:
    inv = Inventory()
    inv.upsert(Asset("k", "项", 1))
    assert inv.remove("k") is True
    assert inv.remove("k") is False
    assert inv.get("k") is None


@pytest.mark.parametrize(
    "kwargs",
    [
        {"asset_id": "", "name": "n", "value_cents": 0},
        {"asset_id": " ", "name": "n", "value_cents": 0},
        {"asset_id": "id", "name": "", "value_cents": 0},
        {"asset_id": "id", "name": " ", "value_cents": 0},
        {"asset_id": "id", "name": "n", "value_cents": -1},
    ],
)
def test_asset_validation(kwargs: dict) -> None:
    with pytest.raises(ValueError):
        Asset(**kwargs)
