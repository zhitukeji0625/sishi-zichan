"""功能完整性：公开 API 与约定行为。"""

import pytest

import sishi_zichan


def test_package_version_defined():
    assert hasattr(sishi_zichan, "__version__")
    assert isinstance(sishi_zichan.__version__, str)
    parts = sishi_zichan.__version__.split(".")
    assert len(parts) >= 2


def test_validate_asset_record_happy_path():
    ok, err = sishi_zichan.validate_asset_record("现金", 100)
    assert ok is True
    assert err is None


@pytest.mark.parametrize(
    "name,value",
    [
        ("", 0),
        ("   ", 0),
        ("有效", -1),
    ],
)
def test_validate_asset_record_rejects_invalid(name, value):
    ok, err = sishi_zichan.validate_asset_record(name, value)
    assert ok is False
    assert err is not None


def test_summarize_assets_merges_and_skips_blank():
    rows = [("A", 10), (" B ", 5), ("", 99), ("B", 5)]
    got = sishi_zichan.summarize_assets(rows)
    assert got == {"A": 10, "B": 10}
