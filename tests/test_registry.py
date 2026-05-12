from __future__ import annotations

import unittest
from decimal import Decimal

from sishi_zichan.models import Asset
from sishi_zichan.registry import AssetRegistry


class TestAssetRegistry(unittest.TestCase):
    def setUp(self) -> None:
        self.reg = AssetRegistry()
        self.a1 = Asset(id="1", name="A", value=Decimal("10"))
        self.a2 = Asset(id="2", name="B", value=Decimal("20.5"))

    def test_add_get_list_total(self) -> None:
        self.reg.add(self.a1)
        self.reg.add(self.a2)
        self.assertIs(self.reg.get("1"), self.a1)
        self.assertEqual(len(self.reg.list()), 2)
        self.assertEqual(self.reg.total_value(), Decimal("30.5"))

    def test_duplicate_id(self) -> None:
        self.reg.add(self.a1)
        with self.assertRaises(ValueError):
            self.reg.add(Asset(id="1", name="dup", value=Decimal("1")))

    def test_remove(self) -> None:
        self.reg.add(self.a1)
        self.assertTrue(self.reg.remove("1"))
        self.assertFalse(self.reg.remove("1"))
        self.assertIsNone(self.reg.get("1"))

    def test_total_empty(self) -> None:
        self.assertEqual(self.reg.total_value(), Decimal("0"))

    def test_iter(self) -> None:
        self.reg.add(self.a1)
        self.reg.add(self.a2)
        ids = {x.id for x in self.reg}
        self.assertEqual(ids, {"1", "2"})


if __name__ == "__main__":
    unittest.main()
