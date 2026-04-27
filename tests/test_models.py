import pytest
from decimal import Decimal

from sishi_zichan.models import Asset


def test_asset_valid() -> None:
    a = Asset("现金", Decimal("100"))
    assert a.name == "现金"
    assert a.amount == Decimal("100")
    assert a.currency == "CNY"


def test_asset_empty_name() -> None:
    with pytest.raises(ValueError, match="名称"):
        Asset("", Decimal("1"))


def test_asset_negative_amount() -> None:
    with pytest.raises(ValueError, match="负数"):
        Asset("x", Decimal("-1"))


def test_asset_empty_currency() -> None:
    with pytest.raises(ValueError, match="币种"):
        Asset("x", Decimal("1"), currency="  ")
