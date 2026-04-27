"""核心 API 行为测试。"""

import pytest

from sishi_zichan import normalize_asset_name, validate_asset_code


def test_normalize_asset_name_trims_and_collapses_whitespace():
    assert normalize_asset_name("  a  b  c  ") == "a b c"
    assert normalize_asset_name("x") == "x"
    assert normalize_asset_name("") == ""


def test_normalize_asset_name_rejects_non_string():
    with pytest.raises(TypeError):
        normalize_asset_name(None)  # type: ignore[arg-type]


@pytest.mark.parametrize(
    "code,expected",
    [
        ("AB", True),
        ("A1", True),
        ("A_B-1", True),
        ("A", False),
        ("", False),
        ("ab", False),
        ("A" * 63, False),
        ("A" * 62, True),
    ],
)
def test_validate_asset_code(code, expected):
    assert validate_asset_code(code) is expected
