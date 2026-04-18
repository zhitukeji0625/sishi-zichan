"""组合与资产核心行为测试。"""

from decimal import Decimal

import pytest

from zichan import Asset, Portfolio


def test_asset_valid() -> None:
    a = Asset("1", "现金", Decimal("100.5"))
    assert a.value == Decimal("100.5")


@pytest.mark.parametrize(
    "kwargs,msg",
    [
        ({"asset_id": "", "name": "x", "value": Decimal("1")}, "asset_id"),
        ({"asset_id": " ", "name": "x", "value": Decimal("1")}, "asset_id"),
        ({"asset_id": "1", "name": "", "value": Decimal("1")}, "name"),
        ({"asset_id": "1", "name": "x", "value": Decimal("-1")}, "负数"),
    ],
)
def test_asset_invalid(kwargs: dict, msg: str) -> None:
    with pytest.raises(ValueError) as e:
        Asset(**kwargs)
    assert msg in str(e.value)


def test_portfolio_add_and_total() -> None:
    p = Portfolio()
    p.add(Asset("a", "A", Decimal("10")))
    p.add(Asset("b", "B", Decimal("20.25")))
    assert len(p) == 2
    assert p.total_value() == Decimal("30.25")


def test_portfolio_duplicate_add() -> None:
    p = Portfolio()
    p.add(Asset("a", "A", Decimal("1")))
    with pytest.raises(ValueError, match="已存在"):
        p.add(Asset("a", "B", Decimal("2")))


def test_portfolio_upsert() -> None:
    p = Portfolio()
    p.upsert(Asset("a", "A", Decimal("1")))
    p.upsert(Asset("a", "A2", Decimal("5")))
    assert p.get("a") == Asset("a", "A2", Decimal("5"))
    assert p.total_value() == Decimal("5")


def test_portfolio_remove() -> None:
    p = Portfolio()
    p.add(Asset("a", "A", Decimal("1")))
    assert p.remove("a") is True
    assert p.remove("a") is False
    assert len(p) == 0


def test_portfolio_iteration() -> None:
    p = Portfolio()
    p.add(Asset("x", "X", Decimal("1")))
    ids = {a.asset_id for a in p}
    assert ids == {"x"}
