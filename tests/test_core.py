import pytest

from sishi_zichan import normalize_asset_code


def test_normalize_basic():
    assert normalize_asset_code("  abc  ") == "ABC"


def test_normalize_already_upper():
    assert normalize_asset_code("XYZ") == "XYZ"


@pytest.mark.parametrize(
    "bad",
    ["", "   ", "\t\n"],
)
def test_normalize_rejects_empty(bad):
    with pytest.raises(ValueError, match="non-empty"):
        normalize_asset_code(bad)


def test_normalize_rejects_none():
    with pytest.raises(ValueError, match="non-empty"):
        normalize_asset_code(None)  # type: ignore[arg-type]
