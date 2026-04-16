import unittest

from sishi_zichan.assets import normalize_asset_name


class TestNormalizeAssetName(unittest.TestCase):
    def test_strips_whitespace(self):
        self.assertEqual(normalize_asset_name("  现金  "), "现金")

    def test_rejects_empty_after_strip(self):
        with self.assertRaises(ValueError):
            normalize_asset_name("   ")

    def test_rejects_empty_string(self):
        with self.assertRaises(ValueError):
            normalize_asset_name("")

    def test_rejects_none(self):
        with self.assertRaises(ValueError):
            normalize_asset_name(None)  # type: ignore[arg-type]


if __name__ == "__main__":
    unittest.main()
