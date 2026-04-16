"""项目元信息与 README 一致性测试。"""

import unittest

from sishi_zichan.project import EXPECTED_PROJECT_SLUG, get_project_info, repo_root


class TestProject(unittest.TestCase):
    def test_repo_root_contains_readme(self) -> None:
        root = repo_root()
        self.assertTrue((root / "README.md").is_file())

    def test_get_project_info(self) -> None:
        info = get_project_info()
        self.assertEqual(info["slug"], EXPECTED_PROJECT_SLUG)
        self.assertTrue(info["readme_exists"])
        self.assertEqual(info["readme_title"], EXPECTED_PROJECT_SLUG)


if __name__ == "__main__":
    unittest.main()
