import pytest

from sishi_zichan.core import normalize_asset_label, validate_asset_code


@pytest.mark.parametrize(
    "code,expected",
    [
        ("ABCD001", True),
        ("WXYZ999", True),
        ("abcd001", False),
        ("ABC001", False),
        ("ABCDE001", False),
        ("ABCD01", False),
        ("", False),
        ("  ABCD001  ", True),
    ],
)
def test_validate_asset_code(code: str, expected: bool) -> None:
    assert validate_asset_code(code) is expected


def test_validate_asset_code_non_string() -> None:
    assert validate_asset_code(123) is False  # type: ignore[arg-type]


def test_normalize_asset_label() -> None:
    assert normalize_asset_label("  现金  账户  ") == "现金 账户"


def test_normalize_asset_label_type() -> None:
    with pytest.raises(TypeError):
        normalize_asset_label(None)  # type: ignore[arg-type]
