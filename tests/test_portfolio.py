import pytest

from sishi_zichan import Asset, Portfolio, __version__


def test_version_is_defined() -> None:
    assert __version__


def test_asset_rejects_negative_amount() -> None:
    with pytest.raises(ValueError, match="不能为负数"):
        Asset("a1", "现金", -1.0)


def test_asset_rejects_blank_id() -> None:
    with pytest.raises(ValueError, match="不能为空"):
        Asset("  ", "现金", 0.0)


def test_portfolio_add_and_total() -> None:
    p = Portfolio()
    p.add(Asset("1", "现金", 100.0))
    p.add(Asset("2", "股票", 200.5))
    assert p.total_value() == pytest.approx(300.5)
    assert len(p) == 2


def test_portfolio_duplicate_raises() -> None:
    p = Portfolio()
    p.add(Asset("1", "现金", 10.0))
    with pytest.raises(ValueError, match="已存在"):
        p.add(Asset("1", "重复", 1.0))


def test_portfolio_remove() -> None:
    p = Portfolio()
    p.add(Asset("x", "项", 5.0))
    removed = p.remove("x")
    assert removed.amount == 5.0
    assert len(p) == 0
    with pytest.raises(KeyError):
        p.remove("x")
