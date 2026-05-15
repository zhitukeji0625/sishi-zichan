"""inventory 模块测试。"""

import pytest

from sishi_zichan.inventory import total_asset_value


def test_empty_list():
    assert total_asset_value([]) == 0.0


def test_sum_integers():
    items = [{"value": 100}, {"value": 50}]
    assert total_asset_value(items) == 150.0


def test_sum_floats():
    items = [{"value": 1.5}, {"value": 2.5}]
    assert total_asset_value(items) == 4.0


def test_missing_value_treated_as_zero():
    items = [{"value": 10}, {}]
    assert total_asset_value(items) == 10.0


def test_invalid_value_skipped():
    items = [{"value": 5}, {"value": "x"}, {"value": None}]
    assert total_asset_value(items) == 5.0


@pytest.mark.parametrize(
    "items, expected",
    [
        ([{"value": 0}], 0.0),
        ([{"value": "-1"}], -1.0),
    ],
)
def test_edge_numeric(items, expected):
    assert total_asset_value(items) == expected
