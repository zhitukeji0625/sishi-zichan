from decimal import Decimal

import pytest

from sishi_zichan import Asset, Portfolio


def test_asset_requires_non_empty_name() -> None:
    with pytest.raises(ValueError, match="名称"):
        Asset("", Decimal("100"))


def test_asset_rejects_negative_amount() -> None:
    with pytest.raises(ValueError, match="负数"):
        Asset("现金", Decimal("-1"))


def test_portfolio_total_and_count() -> None:
    p = Portfolio()
    p.add(Asset("现金", Decimal("1000.50")))
    p.add(Asset("  理财  ", Decimal("2000")))
    assert p.count() == 2
    assert p.total() == Decimal("3000.50")


def test_remove_by_name() -> None:
    p = Portfolio()
    p.add(Asset("A", Decimal("1")))
    p.add(Asset("B", Decimal("2")))
    assert p.remove_by_name("A") is True
    assert p.count() == 1
    assert p.total() == Decimal("2")
    assert p.remove_by_name("A") is False


def test_remove_strips_whitespace_in_name() -> None:
    p = Portfolio()
    p.add(Asset("  基金  ", Decimal("10")))
    assert p.remove_by_name("基金") is True
    assert p.count() == 0
