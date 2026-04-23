import unittest

from sishi_zichan.core import total_assets


class TestTotalAssets(unittest.TestCase):
    def test_sums_positive(self):
        self.assertEqual(total_assets(100.0, 200.5), 300.5)

    def test_rejects_negative_cash(self):
        with self.assertRaises(ValueError):
            total_assets(-1.0, 0.0)

    def test_rejects_negative_investments(self):
        with self.assertRaises(ValueError):
            total_assets(0.0, -0.01)


if __name__ == "__main__":
    unittest.main()
