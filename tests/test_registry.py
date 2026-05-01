import pytest

from sishi_zichan import Asset, AssetRegistry


def test_add_get_and_total() -> None:
    reg = AssetRegistry()
    reg.add(Asset("a1", "cash", 100, 1))
    reg.add(Asset("a2", "bond", 2, 500))
    assert reg.get("a1") == Asset("a1", "cash", 100, 1)
    assert reg.total_value() == 1100


def test_remove() -> None:
    reg = AssetRegistry()
    reg.add(Asset("x", "x", 1, 1))
    assert reg.remove("x") is True
    assert reg.remove("x") is False
    assert reg.get("x") is None


def test_invalid_quantity() -> None:
    a = Asset("q", "bad", -1, 1)
    with pytest.raises(ValueError, match="quantity"):
        a.line_total()


def test_empty_id_rejected() -> None:
    reg = AssetRegistry()
    with pytest.raises(ValueError, match="id"):
        reg.add(Asset("", "n", 1, 1))
