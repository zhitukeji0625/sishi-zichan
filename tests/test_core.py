import pytest

from sishi_zichan import normalize_asset_id


def test_normalize_asset_id_basic():
    assert normalize_asset_id("  abc123  ") == "ABC123"


def test_normalize_asset_id_rejects_empty():
    with pytest.raises(ValueError, match="不能为空"):
        normalize_asset_id("   ")


def test_normalize_asset_id_rejects_none():
    with pytest.raises(TypeError, match="不能为 None"):
        normalize_asset_id(None)
