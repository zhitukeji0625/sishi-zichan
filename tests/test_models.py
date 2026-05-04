import pytest

from sishi_zichan.models import Asset, Portfolio


def test_asset_ok() -> None:
    a = Asset("股票", 1234.56)
    assert a.name == "股票"
    assert a.value == pytest.approx(1234.56)


def test_portfolio_empty_total() -> None:
    assert Portfolio(()).total_value() == 0.0
    assert Portfolio(()).asset_count() == 0
