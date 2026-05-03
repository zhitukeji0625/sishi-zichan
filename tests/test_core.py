from __future__ import annotations

import unittest
from decimal import Decimal

from sishi_zichan.core import normalize_asset_label, round_money


class TestNormalizeAssetLabel(unittest.TestCase):
    def test_strips_and_keeps_content(self) -> None:
        self.assertEqual(normalize_asset_label("  现金  "), "现金")

    def test_rejects_empty_after_strip(self) -> None:
        with self.assertRaises(ValueError):
            normalize_asset_label("   ")

    def test_rejects_none(self) -> None:
        with self.assertRaises(TypeError):
            normalize_asset_label(None)  # type: ignore[arg-type]


class TestRoundMoney(unittest.TestCase):
    def test_half_up(self) -> None:
        self.assertEqual(round_money(Decimal("1.005"), 2), Decimal("1.01"))
        self.assertEqual(round_money(Decimal("1.004"), 2), Decimal("1.00"))

    def test_from_float_string(self) -> None:
        self.assertEqual(round_money("10.126", 2), Decimal("10.13"))

    def test_rejects_negative_places(self) -> None:
        with self.assertRaises(ValueError):
            round_money(Decimal("1"), -1)


if __name__ == "__main__":
    unittest.main()
