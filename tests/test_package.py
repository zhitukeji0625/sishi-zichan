"""包级功能完整性测试。"""

import sishi_zichan


def test_version_is_semver_string():
    assert isinstance(sishi_zichan.__version__, str)
    parts = sishi_zichan.__version__.split(".")
    assert len(parts) >= 2
    assert all(p.isdigit() for p in parts[:2])


def test_project_name_matches_readme_identity():
    assert sishi_zichan.project_name() == "sishi-zichan"
