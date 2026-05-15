import unittest

from sishi_zichan.core import ping


class TestCore(unittest.TestCase):
    def test_ping_returns_pong(self) -> None:
        self.assertEqual(ping(), "pong")


if __name__ == "__main__":
    unittest.main()
