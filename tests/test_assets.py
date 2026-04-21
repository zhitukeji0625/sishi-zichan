import pytest

from sishi_zichan import Asset, AssetRegistry


def test_asset_valid() -> None:
    a = Asset("A1", "现金", 100.0)
    assert a.asset_id == "A1"
    assert a.value == 100.0


def test_asset_rejects_blank_id() -> None:
    with pytest.raises(ValueError, match="asset_id"):
        Asset("", "x", 1.0)
    with pytest.raises(ValueError, match="asset_id"):
        Asset("   ", "x", 1.0)


def test_asset_rejects_negative_value() -> None:
    with pytest.raises(ValueError, match="负数"):
        Asset("A1", "x", -1.0)


def test_registry_add_get_total() -> None:
    reg = AssetRegistry()
    reg.add(Asset("1", "a", 10))
    reg.add(Asset("2", "b", 20.5))
    assert reg.get("1").name == "a"
    assert reg.total_value() == pytest.approx(30.5)
    ids = {x.asset_id for x in reg.list_all()}
    assert ids == {"1", "2"}


def test_registry_duplicate_add() -> None:
    reg = AssetRegistry()
    reg.add(Asset("1", "a", 1))
    with pytest.raises(KeyError, match="已存在"):
        reg.add(Asset("1", "b", 2))


def test_registry_get_missing() -> None:
    reg = AssetRegistry()
    with pytest.raises(KeyError, match="未找到"):
        reg.get("missing")


def test_registry_remove() -> None:
    reg = AssetRegistry()
    reg.add(Asset("1", "a", 1))
    reg.remove("1")
    assert reg.list_all() == []
    with pytest.raises(KeyError):
        reg.remove("1")
