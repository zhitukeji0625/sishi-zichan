from decimal import Decimal

import pytest

from sishi_zichan.core import parse_amount, sum_assets


def test_parse_amount_basic():
    assert parse_amount("123.45") == Decimal("123.45")
    assert parse_amount("  10  ") == Decimal("10")
    assert parse_amount("-0.5") == Decimal("-0.5")


def test_parse_amount_invalid():
    with pytest.raises(ValueError, match="无法解析"):
        parse_amount("12a3")
    with pytest.raises(TypeError):
        parse_amount(100)  # type: ignore[arg-type]


def test_sum_assets():
    assert sum_assets([Decimal("1"), "2", " 3 "]) == Decimal("6")
    with pytest.raises(TypeError):
        sum_assets([1.5])  # type: ignore[list-item]
