import pytest

from sishi_zichan import normalize_asset_name


def test_strips_whitespace():
    assert normalize_asset_name("  现金  ") == "现金"


def test_rejects_empty():
    with pytest.raises(ValueError, match="不能为空"):
        normalize_asset_name("")
    with pytest.raises(ValueError, match="不能为空"):
        normalize_asset_name("   ")


def test_rejects_non_str():
    with pytest.raises(TypeError, match="必须为 str"):
        normalize_asset_name(1)  # type: ignore[arg-type]
