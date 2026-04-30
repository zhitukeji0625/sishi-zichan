"""核心 API 单元测试。"""

import unittest

from sishi_zichan import __version__
from sishi_zichan.core import health, project_name


class TestCore(unittest.TestCase):
    def test_project_name(self) -> None:
        self.assertEqual(project_name(), "sishi-zichan")

    def test_health(self) -> None:
        payload = health()
        self.assertEqual(payload["status"], "ok")
        self.assertEqual(payload["project"], "sishi-zichan")

    def test_version_defined(self) -> None:
        self.assertIsInstance(__version__, str)
        self.assertTrue(len(__version__) > 0)


if __name__ == "__main__":
    unittest.main()
