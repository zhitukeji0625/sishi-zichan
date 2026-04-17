import unittest

from sishi_zichan.core import add


class TestCore(unittest.TestCase):
    def test_add(self) -> None:
        self.assertEqual(add(2, 3), 5)
