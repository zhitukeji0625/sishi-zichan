import pytest

from sishi_zichan.core import format_currency_cny, parse_cny_to_fen


def test_format_zero():
    assert format_currency_cny(0) == "¥0.00"


def test_format_positive():
    assert format_currency_cny(12345) == "¥123.45"


def test_format_negative():
    assert format_currency_cny(-99) == "-¥0.99"


def test_format_requires_int():
    with pytest.raises(TypeError):
        format_currency_cny(1.5)  # type: ignore[arg-type]


def test_parse_basic():
    assert parse_cny_to_fen("12.34") == 1234
    assert parse_cny_to_fen("¥0.00") == 0


def test_parse_partial_decimals():
    assert parse_cny_to_fen("12.3") == 1230


def test_parse_negative():
    assert parse_cny_to_fen("-1.00") == -100
    assert parse_cny_to_fen("-¥0.99") == -99


def test_parse_invalid():
    with pytest.raises(ValueError):
        parse_cny_to_fen("12.345")
    with pytest.raises(ValueError):
        parse_cny_to_fen("")


def test_parse_requires_str():
    with pytest.raises(TypeError):
        parse_cny_to_fen(12)  # type: ignore[arg-type]


def test_round_trip():
    for fen in (0, 1, 999999, -505):
        assert parse_cny_to_fen(format_currency_cny(fen)) == fen
