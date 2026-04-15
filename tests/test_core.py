import math

import pytest

from sishi_zichan import Asset, portfolio_total, validate_asset


def test_portfolio_total_sums_values() -> None:
    assets = [
        Asset("现金", 100.5),
        Asset("存款", 200),
    ]
    assert portfolio_total(assets) == pytest.approx(300.5)


def test_validate_rejects_negative() -> None:
    with pytest.raises(ValueError, match="不能为负数"):
        validate_asset(Asset("负债项", -1))


def test_validate_rejects_nan() -> None:
    with pytest.raises(ValueError, match="NaN"):
        validate_asset(Asset("异常", float("nan")))


def test_validate_rejects_inf() -> None:
    with pytest.raises(ValueError, match="无穷大"):
        validate_asset(Asset("异常", float("inf")))


def test_asset_name_must_be_non_empty() -> None:
    with pytest.raises(ValueError, match="非空"):
        Asset("  ", 0)


def test_asset_value_type() -> None:
    with pytest.raises(TypeError):
        Asset("x", object())  # type: ignore[arg-type]


def test_portfolio_total_empty() -> None:
    assert portfolio_total([]) == 0.0


def test_large_list_numeric_stability() -> None:
    assets = [Asset(f"a{i}", 0.1) for i in range(1000)]
    assert math.isclose(portfolio_total(assets), 100.0, rel_tol=1e-9, abs_tol=1e-9)
