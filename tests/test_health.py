"""功能完整性：健康检查接口行为。"""

from sishi_zichan.health import project_status


def test_project_status_ok():
    s = project_status()
    assert s["ok"] is True
    assert s["name"] == "sishi-zichan"


def test_project_status_keys():
    s = project_status()
    assert set(s.keys()) >= {"ok", "name"}
