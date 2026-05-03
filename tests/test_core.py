import pytest

from sishi_zichan import normalize_asset_name


def test_normalize_strips_whitespace():
    assert normalize_asset_name("  laptop  ") == "laptop"


def test_normalize_rejects_empty():
    with pytest.raises(ValueError, match="empty"):
        normalize_asset_name("   ")


def test_normalize_rejects_non_string():
    with pytest.raises(TypeError, match="str"):
        normalize_asset_name(123)  # type: ignore[arg-type]
