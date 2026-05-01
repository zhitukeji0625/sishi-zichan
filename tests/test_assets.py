import unittest

from sishi_zichan.assets import Asset, AssetError, AssetRegistry


class TestAsset(unittest.TestCase):
    def test_valid_asset(self) -> None:
        a = Asset("现金", 100.5, "流动")
        self.assertEqual(a.name, "现金")
        self.assertEqual(a.amount, 100.5)
        self.assertEqual(a.category, "流动")

    def test_empty_name_raises(self) -> None:
        with self.assertRaises(AssetError):
            Asset("", 1.0)
        with self.assertRaises(AssetError):
            Asset("   ", 1.0)

    def test_negative_amount_raises(self) -> None:
        with self.assertRaises(AssetError):
            Asset("x", -0.01)

    def test_empty_category_raises(self) -> None:
        with self.assertRaises(AssetError):
            Asset("x", 1.0, "")


class TestAssetRegistry(unittest.TestCase):
    def test_add_and_total(self) -> None:
        r = AssetRegistry()
        r.add(Asset("a", 10))
        r.add(Asset("b", 20.5))
        self.assertEqual(len(r), 2)
        self.assertAlmostEqual(r.total_amount(), 30.5)

    def test_total_by_category(self) -> None:
        r = AssetRegistry()
        r.add(Asset("x", 1, "A"))
        r.add(Asset("y", 2, "A"))
        r.add(Asset("z", 3, "B"))
        self.assertEqual(r.total_by_category(), {"A": 3.0, "B": 3.0})

    def test_remove_by_name(self) -> None:
        r = AssetRegistry()
        r.add(Asset("dup", 1))
        r.add(Asset("dup", 2))
        self.assertTrue(r.remove_by_name("dup"))
        self.assertEqual(len(r), 1)
        self.assertAlmostEqual(r.total_amount(), 2.0)
        self.assertFalse(r.remove_by_name("none"))
