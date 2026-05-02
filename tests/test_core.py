"""核心模块测试。"""

from decimal import Decimal

import pytest

from sishi_zichan.core import normalize_asset_label, parse_amount


def test_parse_amount_basic():
    assert parse_amount("100") == Decimal("100")
    assert parse_amount("  12.5  ") == Decimal("12.5")
    assert parse_amount("1,234.56") == Decimal("1234.56")


def test_parse_amount_negative():
    assert parse_amount("-0.5") == Decimal("-0.5")


def test_parse_amount_invalid():
    with pytest.raises(ValueError, match="不能为 None"):
        parse_amount(None)
    with pytest.raises(ValueError, match="不能为空"):
        parse_amount("")
    with pytest.raises(ValueError, match="无效金额格式"):
        parse_amount("12a")
    with pytest.raises(ValueError, match="无效金额格式"):
        parse_amount("1.2.3")


def test_normalize_asset_label():
    assert normalize_asset_label("  现金  ") == "现金"
    with pytest.raises(ValueError):
        normalize_asset_label(None)
    with pytest.raises(ValueError):
        normalize_asset_label("   ")
