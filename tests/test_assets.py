import pytest

from sishi_zichan import Asset, AssetStore


def test_asset_valid():
    a = Asset("1", " 现金 ", 100.5)
    assert a.name == "现金"
    assert a.value == 100.5


@pytest.mark.parametrize(
    "kwargs,msg",
    [
        ({"asset_id": "", "name": "x", "value": 1}, "asset_id"),
        ({"asset_id": "   ", "name": "x", "value": 1}, "asset_id"),
        ({"asset_id": "1", "name": "", "value": 1}, "name"),
        ({"asset_id": "1", "name": "   ", "value": 1}, "name"),
        ({"asset_id": "1", "name": "x", "value": -1}, "value"),
        ({"asset_id": "1", "name": "x", "value": float("nan")}, "NaN"),
    ],
)
def test_asset_invalid(kwargs, msg):
    with pytest.raises(ValueError) as e:
        Asset(**kwargs)
    assert msg in str(e.value)


def test_store_upsert_get_remove_total():
    s = AssetStore()
    s.upsert(Asset("a", "A", 10))
    s.upsert(Asset("b", "B", 20))
    assert s.count() == 2
    assert s.total_value() == 30
    assert s.get("a").name == "A"
    assert s.remove("a") is True
    assert s.remove("a") is False
    assert s.total_value() == 20
    assert list(s) == [Asset("b", "B", 20)]


def test_store_upsert_overwrites():
    s = AssetStore()
    s.upsert(Asset("x", "old", 1))
    s.upsert(Asset("x", "new", 2))
    assert s.get("x").name == "new"
    assert s.total_value() == 2
    assert s.count() == 1
