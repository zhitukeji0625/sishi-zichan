import pytest

from sishi_zichan import __version__, normalize_asset_id


def test_version():
    assert __version__ == "0.1.0"


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("  abc  ", "ABC"),
        ("x1", "X1"),
    ],
)
def test_normalize_ok(raw, expected):
    assert normalize_asset_id(raw) == expected


def test_normalize_rejects_empty():
    with pytest.raises(ValueError, match="不能为空"):
        normalize_asset_id("")
    with pytest.raises(ValueError, match="不能为空"):
        normalize_asset_id("   ")


def test_normalize_rejects_none():
    with pytest.raises(TypeError, match="不能为 None"):
        normalize_asset_id(None)
