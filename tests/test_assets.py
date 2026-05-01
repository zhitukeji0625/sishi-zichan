import pytest

from sishi_zichan import Asset, AssetRegistry


def test_add_get_remove() -> None:
    reg = AssetRegistry()
    a = Asset("1", "cash", 100.0)
    reg.add(a)
    assert reg.get("1") == a
    assert reg.remove("1") == a
    with pytest.raises(KeyError):
        reg.get("1")


def test_duplicate_id_rejected() -> None:
    reg = AssetRegistry()
    reg.add(Asset("x", "a", 1))
    with pytest.raises(KeyError):
        reg.add(Asset("x", "b", 2))


def test_total_value_empty() -> None:
    assert AssetRegistry().total_value() == 0.0


def test_total_value_sum() -> None:
    reg = AssetRegistry()
    reg.add(Asset("a", "one", 10.5))
    reg.add(Asset("b", "two", 20.0))
    assert reg.total_value() == 30.5


@pytest.mark.parametrize(
    "kwargs",
    [
        {"id": "", "name": "n", "value": 0},
        {"id": " ", "name": "n", "value": 0},
        {"id": "ok", "name": "n", "value": -0.01},
    ],
)
def test_asset_validation(kwargs: dict) -> None:
    with pytest.raises(ValueError):
        Asset(**kwargs)
