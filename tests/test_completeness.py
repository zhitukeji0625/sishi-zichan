import pytest

from sishi_zichan.completeness import validate_asset_record


@pytest.mark.parametrize(
    "record,expected_missing",
    [
        (
            {"id": "a1", "name": "设备", "category": "固定资产"},
            [],
        ),
        (
            {"id": "", "name": "x", "category": "y"},
            ["id"],
        ),
        (
            {"id": "1", "name": "  ", "category": "y"},
            ["name"],
        ),
        (
            {},
            ["id", "name", "category"],
        ),
    ],
)
def test_validate_asset_record(record, expected_missing):
    assert validate_asset_record(record) == expected_missing


def test_non_dict_root():
    assert validate_asset_record("bad") == ["<root>"]
