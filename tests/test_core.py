import pytest

from sishi_zichan.core import normalize_asset_code, validate_asset_code


def test_validate_asset_code_accepts_valid():
    assert validate_asset_code("ab12")
    assert validate_asset_code("ASSET_01")
    assert validate_asset_code("a" * 64)


def test_validate_asset_code_rejects_invalid():
    assert not validate_asset_code("")
    assert not validate_asset_code("   ")
    assert not validate_asset_code("ab")  # too short
    assert not validate_asset_code("a" * 65)
    assert not validate_asset_code("bad space")
    assert not validate_asset_code("unicode-中文")
    assert not validate_asset_code(None)  # type: ignore[arg-type]


def test_normalize_asset_code():
    assert normalize_asset_code("  ASSET_01  ") == "ASSET_01"


def test_normalize_asset_code_invalid():
    with pytest.raises(ValueError):
        normalize_asset_code("no")


def test_normalize_asset_code_type():
    with pytest.raises(TypeError):
        normalize_asset_code(None)  # type: ignore[arg-type]
