from decimal import Decimal

import pytest

from sishi_zichan.assets import Asset, Portfolio


def test_asset_valid():
    a = Asset("a1", "现金", Decimal("100"))
    assert a.total_value == Decimal("100")


@pytest.mark.parametrize(
    "kwargs",
    [
        {"asset_id": "", "name": "x", "value": Decimal("1")},
        {"asset_id": "  ", "name": "x", "value": Decimal("1")},
        {"asset_id": "a", "name": "", "value": Decimal("1")},
        {"asset_id": "a", "name": "  ", "value": Decimal("1")},
        {"asset_id": "a", "name": "x", "value": Decimal("-1")},
    ],
)
def test_asset_invalid(kwargs):
    with pytest.raises(ValueError):
        Asset(**kwargs)


def test_portfolio_add_and_total():
    p = Portfolio()
    p.add(Asset("1", "A", Decimal("10")))
    p.add(Asset("2", "B", Decimal("20.5")))
    assert p.total_value() == Decimal("30.5")
    assert p.count() == 2
    assert p.get("1").name == "A"


def test_portfolio_duplicate_id():
    p = Portfolio()
    p.add(Asset("1", "A", Decimal("1")))
    with pytest.raises(ValueError):
        p.add(Asset("1", "B", Decimal("2")))
