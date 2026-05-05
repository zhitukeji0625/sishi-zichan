import pytest

from zichan.assets import summarize_positions


def test_summarize_merges_same_symbol():
    out = summarize_positions(
        [
            {"symbol": "AAA", "quantity": 10, "price": 2},
            {"symbol": "AAA", "quantity": 5, "price": 4},
        ]
    )
    assert out["by_symbol"]["AAA"]["quantity"] == 15
    assert out["by_symbol"]["AAA"]["value"] == 10 * 2 + 5 * 4
    assert out["total_value"] == out["by_symbol"]["AAA"]["value"]


def test_summarize_multiple_symbols():
    out = summarize_positions(
        [
            {"symbol": "X", "quantity": 1, "price": 100},
            {"symbol": "Y", "quantity": 2, "price": 50},
        ]
    )
    assert out["total_value"] == 200


def test_rejects_negative_quantity():
    with pytest.raises(ValueError, match="非负"):
        summarize_positions([{"symbol": "Z", "quantity": -1, "price": 1}])


def test_rejects_empty_symbol():
    with pytest.raises(ValueError, match="symbol"):
        summarize_positions([{"symbol": "  ", "quantity": 1, "price": 1}])
