"""功能完整性：包可导入、版本与健康检查可用。"""

import unittest

import sishi_zichan


class TestCompleteness(unittest.TestCase):
    def test_version_defined(self) -> None:
        self.assertTrue(hasattr(sishi_zichan, "__version__"))
        self.assertIsInstance(sishi_zichan.__version__, str)
        self.assertTrue(len(sishi_zichan.__version__) > 0)

    def test_health_returns_ok(self) -> None:
        body = sishi_zichan.health()
        self.assertEqual(body.get("status"), "ok")
        self.assertEqual(body.get("version"), sishi_zichan.__version__)


if __name__ == "__main__":
    unittest.main()
