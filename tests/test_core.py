import pytest

from sishi_zichan import is_valid_asset_id, normalize_asset_id


def test_normalize_valid() -> None:
    assert normalize_asset_id("  ast-0001  ") == "AST-0001"
    assert normalize_asset_id("AST-12345678") == "AST-12345678"


def test_normalize_invalid() -> None:
    with pytest.raises(ValueError):
        normalize_asset_id("foo")
    with pytest.raises(ValueError):
        normalize_asset_id("AST-1")
    with pytest.raises(ValueError):
        normalize_asset_id("ast-123456789")


def test_is_valid() -> None:
    assert is_valid_asset_id("ast-0001") is True
    assert is_valid_asset_id("bad") is False
