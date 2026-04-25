"""资产登记核心行为测试。"""

import unittest

from sishi_zichan import AssetRegistry


class TestAssetRegistry(unittest.TestCase):
    def test_empty_total_zero(self) -> None:
        r = AssetRegistry()
        self.assertEqual(r.total(), 0.0)
        self.assertEqual(r.names(), [])

    def test_add_and_total(self) -> None:
        r = AssetRegistry()
        r.add("现金", 100)
        r.add("存款", 250.5)
        self.assertAlmostEqual(r.total(), 350.5)
        self.assertEqual(set(r.names()), {"现金", "存款"})

    def test_same_name_overwrites(self) -> None:
        r = AssetRegistry()
        r.add("a", 1)
        r.add("a", 2)
        self.assertEqual(r.get("a"), 2.0)
        self.assertEqual(r.total(), 2.0)

    def test_whitespace_trimmed(self) -> None:
        r = AssetRegistry()
        r.add("  x  ", 3)
        self.assertEqual(r.get("x"), 3.0)

    def test_invalid_name(self) -> None:
        r = AssetRegistry()
        with self.assertRaises(ValueError):
            r.add("", 1)
        with self.assertRaises(ValueError):
            r.add("   ", 1)

    def test_invalid_value_type(self) -> None:
        r = AssetRegistry()
        with self.assertRaises(TypeError):
            r.add("x", "1")  # type: ignore[arg-type]

    def test_negative_value(self) -> None:
        r = AssetRegistry()
        with self.assertRaises(ValueError):
            r.add("x", -1)

    def test_get_missing(self) -> None:
        r = AssetRegistry()
        with self.assertRaises(KeyError):
            r.get("missing")


if __name__ == "__main__":
    unittest.main()
