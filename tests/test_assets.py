import pytest

from sishi_zichan import __version__, total_position_value


def test_version_defined():
    assert isinstance(__version__, str)
    assert __version__


def test_total_empty():
    assert total_position_value([]) == 0.0


def test_total_single():
    assert total_position_value([{"quantity": 2, "unit_price": 10.5}]) == 21.0


def test_total_multiple():
    positions = [
        {"quantity": 1, "unit_price": 100},
        {"quantity": 3, "unit_price": 50},
    ]
    assert total_position_value(positions) == 250.0


def test_missing_quantity_raises():
    with pytest.raises(ValueError, match="missing field quantity"):
        total_position_value([{"unit_price": 1}])


def test_missing_unit_price_raises():
    with pytest.raises(ValueError, match="missing field unit_price"):
        total_position_value([{"quantity": 1}])


def test_non_numeric_raises():
    with pytest.raises(ValueError, match="must be numbers"):
        total_position_value([{"quantity": "1", "unit_price": 2}])
