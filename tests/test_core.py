import pytest

from sishi_zichan import __version__, normalize_asset_code


def test_version():
    assert __version__ == "0.1.0"


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("abc123", "ABC123"),
        ("  xyz  ", "XYZ"),
        ("A1", "A1"),
    ],
)
def test_normalize_ok(raw, expected):
    assert normalize_asset_code(raw) == expected


def test_normalize_empty():
    with pytest.raises(ValueError, match="empty"):
        normalize_asset_code("")


def test_normalize_non_alnum():
    with pytest.raises(ValueError, match="alphanumeric"):
        normalize_asset_code("a-b")


def test_normalize_none():
    with pytest.raises(TypeError):
        normalize_asset_code(None)
