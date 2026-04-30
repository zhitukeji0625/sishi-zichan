import unittest

from sishi_zichan import health


class TestHealth(unittest.TestCase):
    def test_health_returns_ok_and_service(self) -> None:
        h = health()
        self.assertEqual(h["status"], "ok")
        self.assertEqual(h["service"], "sishi-zichan")
