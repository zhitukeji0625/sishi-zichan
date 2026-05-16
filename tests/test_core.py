import unittest

from sishi_zichan.core import normalize_asset_id


class TestNormalizeAssetId(unittest.TestCase):
    def test_strips_and_lowercases(self):
        self.assertEqual(normalize_asset_id("  AbC  "), "abc")

    def test_rejects_empty_string(self):
        with self.assertRaises(ValueError):
            normalize_asset_id("")

    def test_rejects_whitespace_only(self):
        with self.assertRaises(ValueError):
            normalize_asset_id("   \t\n")

    def test_rejects_none(self):
        with self.assertRaises(ValueError):
            normalize_asset_id(None)  # type: ignore[arg-type]

    def test_accepts_non_str_coercible(self):
        self.assertEqual(normalize_asset_id(100), "100")


if __name__ == "__main__":
    unittest.main()
