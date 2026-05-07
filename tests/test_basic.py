"""基础功能完整性测试。"""

from sishi_zichan import project_name


def test_project_name():
    assert project_name() == "sishi-zichan"
