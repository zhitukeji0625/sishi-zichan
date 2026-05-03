"""
功能完整性：覆盖公开 API 的约定行为与边界情况。
"""

from __future__ import annotations

from sishi_zichan import format_asset_id, merge_metadata, validate_amount


class TestValidateAmount:
    def test_zero_and_positive_int(self) -> None:
        assert validate_amount(0) is True
        assert validate_amount(1) is True

    def test_positive_float(self) -> None:
        assert validate_amount(0.01) is True

    def test_negative_rejected(self) -> None:
        assert validate_amount(-1) is False
        assert validate_amount(-0.001) is False

    def test_nan_inf_rejected(self) -> None:
        assert validate_amount(float("nan")) is False
        assert validate_amount(float("inf")) is False
        assert validate_amount(float("-inf")) is False

    def test_bool_not_treated_as_number_for_amount(self) -> None:
        assert validate_amount(True) is False
        assert validate_amount(False) is False

    def test_invalid_types(self) -> None:
        assert validate_amount("1") is False  # type: ignore[arg-type]
        assert validate_amount(None) is False  # type: ignore[arg-type]


class TestFormatAssetId:
    def test_strip_and_upper(self) -> None:
        assert format_asset_id("  abc-01  ") == "ABC-01"

    def test_none_returns_empty(self) -> None:
        assert format_asset_id(None) == ""

    def test_empty_string(self) -> None:
        assert format_asset_id("") == ""
        assert format_asset_id("   ") == ""


class TestMergeMetadata:
    def test_single_dict(self) -> None:
        assert merge_metadata({"a": 1}) == {"a": 1}

    def test_later_overrides(self) -> None:
        assert merge_metadata({"a": 1}, {"a": 2}) == {"a": 2}

    def test_skips_none(self) -> None:
        assert merge_metadata({"a": 1}, None, {"b": 2}) == {"a": 1, "b": 2}

    def test_empty_call(self) -> None:
        assert merge_metadata() == {}
