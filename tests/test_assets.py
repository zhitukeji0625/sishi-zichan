"""资产模块功能完整性测试。"""

import pytest

from sishi_zichan import format_total_cny, sum_assets, validate_asset_item


def test_sum_assets_empty():
    assert sum_assets([]) == 0.0


def test_sum_assets_single():
    assert sum_assets([{"name": "现金", "amount": 100.5}]) == 100.5


def test_sum_assets_multiple():
    items = [
        {"name": "现金", "amount": 100},
        {"name": "存款", "amount": 200.25},
    ]
    assert sum_assets(items) == 300.25


def test_validate_rejects_non_dict():
    with pytest.raises(TypeError, match="字典"):
        validate_asset_item([])


def test_validate_rejects_missing_fields():
    with pytest.raises(ValueError, match="name 与 amount"):
        validate_asset_item({"name": "x"})


def test_validate_rejects_empty_name():
    with pytest.raises(ValueError, match="name"):
        validate_asset_item({"name": "   ", "amount": 1})


def test_validate_rejects_bad_amount_type():
    with pytest.raises(TypeError, match="数字"):
        validate_asset_item({"name": "a", "amount": "1"})


def test_validate_rejects_negative_amount():
    with pytest.raises(ValueError, match="负数"):
        validate_asset_item({"name": "a", "amount": -1})


def test_format_total_cny():
    assert format_total_cny(1234.5) == "¥1,234.50"
