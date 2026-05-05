import pytest

from sishi_zichan import normalize_asset_code, version


def test_version():
    assert version() == "0.1.0"


def test_normalize_strips_and_uppercases():
    assert normalize_asset_code("  abc123  ") == "ABC123"


def test_normalize_rejects_empty():
    with pytest.raises(ValueError, match="empty"):
        normalize_asset_code("   ")


def test_normalize_rejects_non_alnum():
    with pytest.raises(ValueError, match="alphanumeric"):
        normalize_asset_code("AB-1")


def test_normalize_type():
    with pytest.raises(TypeError):
        normalize_asset_code(1)  # type: ignore[arg-type]
