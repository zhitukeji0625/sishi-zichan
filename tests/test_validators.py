import unittest

from sishi_zichan.validators import normalize_asset_code, validate_positive_amount


class TestValidatePositiveAmount(unittest.TestCase):
    def test_accepts_positive_int(self):
        validate_positive_amount(1)

    def test_accepts_positive_float(self):
        validate_positive_amount(0.01)

    def test_rejects_zero(self):
        with self.assertRaises(ValueError):
            validate_positive_amount(0)

    def test_rejects_negative(self):
        with self.assertRaises(ValueError):
            validate_positive_amount(-1)

    def test_rejects_nan(self):
        with self.assertRaises(ValueError):
            validate_positive_amount(float("nan"))

    def test_rejects_inf(self):
        with self.assertRaises(ValueError):
            validate_positive_amount(float("inf"))

    def test_rejects_bool(self):
        with self.assertRaises(TypeError):
            validate_positive_amount(True)

    def test_rejects_non_numeric(self):
        with self.assertRaises(TypeError):
            validate_positive_amount("10")


class TestNormalizeAssetCode(unittest.TestCase):
    def test_strips_and_uppercases(self):
        self.assertEqual(normalize_asset_code("  btc  "), "BTC")

    def test_rejects_empty(self):
        with self.assertRaises(ValueError):
            normalize_asset_code("   ")

    def test_rejects_non_string(self):
        with self.assertRaises(TypeError):
            normalize_asset_code(1)


if __name__ == "__main__":
    unittest.main()
