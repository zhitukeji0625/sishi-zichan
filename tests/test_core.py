from decimal import Decimal

import pytest

from sishi_zichan.core import AssetRecord, normalize_record, parse_amount, total_assets


def test_parse_amount_basic():
    assert parse_amount("100") == Decimal("100")
    assert parse_amount("1,234.56") == Decimal("1234.56")
    assert parse_amount(10) == Decimal("10")


def test_parse_amount_rejects_negative_and_empty():
    with pytest.raises(ValueError, match="负数"):
        parse_amount("-1")
    with pytest.raises(ValueError, match="不能为空"):
        parse_amount("")
    with pytest.raises(ValueError, match="不能为空"):
        parse_amount(None)


def test_normalize_record():
    r = normalize_record("  现金  ", " 500.5 ", "cny")
    assert r == AssetRecord(name="现金", amount=Decimal("500.5"), currency="CNY")


def test_normalize_record_invalid_currency():
    with pytest.raises(ValueError, match="三位"):
        normalize_record("a", "1", "CN")


def test_total_assets_empty():
    assert total_assets([]) == Decimal("0")


def test_total_assets_sum():
    rs = [
        AssetRecord("a", Decimal("10"), "CNY"),
        AssetRecord("b", Decimal("20.5"), "CNY"),
    ]
    assert total_assets(rs) == Decimal("30.5")


def test_total_assets_mixed_currency():
    rs = [
        AssetRecord("a", Decimal("1"), "CNY"),
        AssetRecord("b", Decimal("1"), "USD"),
    ]
    with pytest.raises(ValueError, match="多币种"):
        total_assets(rs)
