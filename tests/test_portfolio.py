import unittest
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sishi_zichan.portfolio import Asset, Portfolio


class TestAsset(unittest.TestCase):
    def test_valid(self) -> None:
        a = Asset("a1", "现金", 100.5)
        self.assertEqual(a.amount, 100.5)

    def test_rejects_negative_amount(self) -> None:
        with self.assertRaises(ValueError):
            Asset("a1", "现金", -1)

    def test_rejects_blank_id(self) -> None:
        with self.assertRaises(ValueError):
            Asset("  ", "现金", 0)

    def test_rejects_blank_name(self) -> None:
        with self.assertRaises(ValueError):
            Asset("a1", "", 0)


class TestPortfolio(unittest.TestCase):
    def test_empty_total(self) -> None:
        p = Portfolio()
        self.assertEqual(p.total_amount(), 0.0)
        self.assertEqual(len(p), 0)

    def test_upsert_and_total(self) -> None:
        p = Portfolio()
        p.upsert(Asset("1", "存款", 100))
        p.upsert(Asset("2", "基金", 200.5))
        self.assertEqual(p.total_amount(), 300.5)
        self.assertEqual(len(p), 2)

    def test_upsert_overwrites_same_id(self) -> None:
        p = Portfolio()
        p.upsert(Asset("1", "旧", 10))
        p.upsert(Asset("1", "新", 50))
        self.assertEqual(len(p), 1)
        self.assertEqual(p.get("1").name, "新")
        self.assertEqual(p.total_amount(), 50.0)

    def test_remove(self) -> None:
        p = Portfolio()
        p.upsert(Asset("1", "x", 1))
        self.assertTrue(p.remove("1"))
        self.assertFalse(p.remove("1"))
        self.assertIsNone(p.get("1"))

    def test_iteration(self) -> None:
        p = Portfolio()
        p.upsert(Asset("1", "a", 1))
        p.upsert(Asset("2", "b", 2))
        amounts = {a.asset_id: a.amount for a in p}
        self.assertEqual(amounts, {"1": 1.0, "2": 2.0})


if __name__ == "__main__":
    unittest.main()
