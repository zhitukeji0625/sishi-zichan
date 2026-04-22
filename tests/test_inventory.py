"""Feature completeness: inventory API must behave as documented."""

from __future__ import annotations

import unittest

import sishi_zichan
from sishi_zichan import inventory


class TestPublicExports(unittest.TestCase):
    def test_package_exports_expected_symbols(self) -> None:
        expected = {"clear_inventory", "list_assets", "register_asset", "total_value"}
        self.assertTrue(expected.issubset(set(sishi_zichan.__all__)))
        for name in expected:
            self.assertTrue(hasattr(sishi_zichan, name), f"missing export: {name}")


class TestInventory(unittest.TestCase):
    def setUp(self) -> None:
        inventory.clear_inventory()

    def tearDown(self) -> None:
        inventory.clear_inventory()

    def test_register_list_total(self) -> None:
        sishi_zichan.register_asset("现金", 100.0)
        sishi_zichan.register_asset("设备", 250.5)
        self.assertEqual(
            sishi_zichan.list_assets(),
            [("现金", 100.0), ("设备", 250.5)],
        )
        self.assertAlmostEqual(sishi_zichan.total_value(), 350.5)

    def test_rejects_empty_name(self) -> None:
        with self.assertRaises(ValueError):
            sishi_zichan.register_asset("", 1.0)
        with self.assertRaises(ValueError):
            sishi_zichan.register_asset("   ", 1.0)

    def test_rejects_negative_value(self) -> None:
        with self.assertRaises(ValueError):
            sishi_zichan.register_asset("负债项", -1.0)

    def test_iter_asset_names(self) -> None:
        inventory.register_asset("a", 1)
        inventory.register_asset("b", 2)
        self.assertEqual(list(inventory.iter_asset_names()), ["a", "b"])


if __name__ == "__main__":
    unittest.main()
