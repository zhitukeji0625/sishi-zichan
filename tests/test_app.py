import unittest

from sishi_zichan import app_status, __version__


class AppTests(unittest.TestCase):
    def test_version_is_semantic_string(self):
        self.assertIsInstance(__version__, str)
        self.assertRegex(__version__, r"^\d+\.\d+\.\d+$")

    def test_app_status(self):
        s = app_status()
        self.assertTrue(s["ok"])
        self.assertEqual(s["service"], "sishi-zichan")
        self.assertEqual(s["version"], __version__)


if __name__ == "__main__":
    unittest.main()
