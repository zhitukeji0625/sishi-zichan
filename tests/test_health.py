import unittest

from zichan.health import health_check


class TestHealth(unittest.TestCase):
    def test_health_check_returns_ok(self) -> None:
        result = health_check()
        self.assertIsInstance(result, dict)
        self.assertEqual(result.get("status"), "ok")


if __name__ == "__main__":
    unittest.main()
