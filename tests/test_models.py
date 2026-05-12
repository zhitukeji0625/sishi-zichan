from __future__ import annotations

import unittest
from decimal import Decimal

from sishi_zichan.models import Asset


class TestAsset(unittest.TestCase):
    def test_valid_asset(self) -> None:
        a = Asset(id="a1", name="现金", value=Decimal("100"))
        self.assertEqual(a.id, "a1")
        self.assertEqual(a.value, Decimal("100"))

    def test_rejects_empty_id(self) -> None:
        with self.assertRaises(ValueError):
            Asset(id="  ", name="x", value=Decimal("1"))

    def test_rejects_empty_name(self) -> None:
        with self.assertRaises(ValueError):
            Asset(id="i", name="", value=Decimal("1"))

    def test_rejects_negative_value(self) -> None:
        with self.assertRaises(ValueError):
            Asset(id="i", name="n", value=Decimal("-0.01"))


if __name__ == "__main__":
    unittest.main()
