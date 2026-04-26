from decimal import Decimal

from sishi_zichan import Asset, Portfolio


def test_asset_decimal_normalization() -> None:
    a = Asset("cash", Decimal("100.50"))
    assert a.normalized_value() == Decimal("100.50")


def test_asset_float_normalized_via_string() -> None:
    a = Asset("bond", 0.1)
    assert a.normalized_value() == Decimal("0.1")


def test_portfolio_empty_total() -> None:
    p = Portfolio()
    assert len(p) == 0
    assert p.total_value() == Decimal("0")


def test_portfolio_sum_all_currencies() -> None:
    p = Portfolio(
        [
            Asset("a", 100, "CNY"),
            Asset("b", 50, "USD"),
        ]
    )
    assert p.total_value() == Decimal("150")


def test_portfolio_filter_currency() -> None:
    p = Portfolio(
        [
            Asset("cny", 200, "CNY"),
            Asset("usd", 10, "USD"),
        ]
    )
    assert p.total_value("CNY") == Decimal("200")
    assert p.total_value("USD") == Decimal("10")


def test_portfolio_add() -> None:
    p = Portfolio()
    p.add(Asset("x", 1))
    assert len(p) == 1
    assert p.total_value() == Decimal("1")
