"""核心模块单元测试。"""

import unittest

from sishi_zichan.core import net_worth


class TestNetWorth(unittest.TestCase):
    def test_basic(self):
        self.assertEqual(net_worth([100.0, 50.0], [30.0]), 120.0)

    def test_empty_assets(self):
        self.assertEqual(net_worth([], [40.0]), -40.0)

    def test_empty_liabilities(self):
        self.assertEqual(net_worth([10.0], []), 10.0)

    def test_both_empty(self):
        self.assertEqual(net_worth([], []), 0.0)

    def test_float_precision_sum(self):
        self.assertAlmostEqual(net_worth([0.1, 0.2], []), 0.3, places=10)


if __name__ == "__main__":
    unittest.main()
