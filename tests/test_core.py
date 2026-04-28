"""核心功能完整性测试。"""

import pytest

from sishi_zichan.core import calculate_total_value, validate_holding


def test_empty_holdings():
    assert calculate_total_value([]) == 0.0


def test_single_holding():
    assert calculate_total_value([{"quantity": 10, "price": 2.5}]) == 25.0


def test_multiple_holdings():
    holdings = [
        {"quantity": 100, "price": 1.0},
        {"quantity": 50, "price": 2.0},
    ]
    assert calculate_total_value(holdings) == 200.0


def test_zero_quantity_allowed():
    assert calculate_total_value([{"quantity": 0, "price": 99.0}]) == 0.0


def test_negative_quantity_rejected():
    with pytest.raises(ValueError, match="非负数"):
        calculate_total_value([{"quantity": -1, "price": 1.0}])


def test_negative_price_rejected():
    with pytest.raises(ValueError, match="非负数"):
        calculate_total_value([{"quantity": 1, "price": -0.01}])


def test_validate_holding_direct():
    validate_holding({"quantity": 1, "price": 0})
    with pytest.raises(ValueError):
        validate_holding({"quantity": -0.001, "price": 1})
