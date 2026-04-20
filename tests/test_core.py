import unittest

from sishi_zichan.core import net_worth


class NetWorthTests(unittest.TestCase):
    def test_basic(self):
        self.assertEqual(net_worth(100, 30), 70)

    def test_zero_liabilities(self):
        self.assertEqual(net_worth(50, 0), 50)

    def test_negative_assets_rejected(self):
        with self.assertRaises(ValueError):
            net_worth(-1, 0)

    def test_negative_liabilities_rejected(self):
        with self.assertRaises(ValueError):
            net_worth(10, -1)


if __name__ == "__main__":
    unittest.main()
