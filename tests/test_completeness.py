"""资产记录完整性校验测试。"""

import unittest

from sishi_zichan.completeness import validate_asset_record


class ValidateAssetRecordTests(unittest.TestCase):
    def test_complete_record_ok(self) -> None:
        validate_asset_record({"id": "a1", "name": "现金", "value": 100})

    def test_rejects_non_mapping(self) -> None:
        with self.assertRaisesRegex(TypeError, "映射"):
            validate_asset_record([])  # type: ignore[arg-type]

    def test_missing_field(self) -> None:
        with self.assertRaisesRegex(ValueError, "不完整"):
            validate_asset_record({"id": "a1", "name": "现金"})

    def test_blank_string_field(self) -> None:
        with self.assertRaisesRegex(ValueError, "name"):
            validate_asset_record({"id": "a1", "name": "   ", "value": 1})

    def test_none_value(self) -> None:
        with self.assertRaisesRegex(ValueError, "value"):
            validate_asset_record({"id": "a1", "name": "x", "value": None})


if __name__ == "__main__":
    unittest.main()
