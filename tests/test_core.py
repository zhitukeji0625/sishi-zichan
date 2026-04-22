import pytest

from sishi_zichan.core import normalize_asset_code, version


def test_version_non_empty():
    assert version()
    assert isinstance(version(), str)


def test_normalize_asset_code_ok():
    assert normalize_asset_code("  abc-12  ") == "ABC-12"


def test_normalize_asset_code_rejects_empty():
    with pytest.raises(ValueError, match="不能为空"):
        normalize_asset_code("   ")


def test_normalize_asset_code_rejects_none():
    with pytest.raises(TypeError, match="不能为 None"):
        normalize_asset_code(None)


def test_normalize_asset_code_rejects_invalid():
    with pytest.raises(ValueError, match="格式无效"):
        normalize_asset_code("bad code!")
