import pytest

from sishi_zichan import normalize_asset_code, parse_amount


def test_normalize_asset_code_basic():
    assert normalize_asset_code("  abc123  ") == "ABC123"


def test_normalize_asset_code_rejects_empty():
    with pytest.raises(ValueError, match="不能为空"):
        normalize_asset_code("   ")


def test_normalize_asset_code_rejects_none():
    with pytest.raises(TypeError, match="None"):
        normalize_asset_code(None)  # type: ignore[arg-type]


def test_parse_amount_basic():
    assert parse_amount(" 123.45 ") == 123.45


def test_parse_amount_with_commas():
    assert parse_amount("1,234.56") == 1234.56


def test_parse_amount_rejects_empty():
    with pytest.raises(ValueError, match="不能为空"):
        parse_amount("")


def test_parse_amount_rejects_invalid():
    with pytest.raises(ValueError, match="无法解析"):
        parse_amount("12a")
