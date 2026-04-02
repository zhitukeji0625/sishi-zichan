import pytest

from sishi_zichan.portfolio import total_market_value


def test_total_basic():
    assert (
        total_market_value({"A": 10, "B": 5}, {"A": 2.0, "B": 4.0}) == 40.0
    )


def test_missing_price_skipped():
    assert total_market_value({"A": 10, "B": 5}, {"A": 2.0}) == 20.0


def test_negative_quantity():
    with pytest.raises(ValueError, match="不能为负"):
        total_market_value({"A": -1}, {"A": 1.0})


def test_negative_price():
    with pytest.raises(ValueError, match="价格不能为负"):
        total_market_value({"A": 1}, {"A": -1.0})
