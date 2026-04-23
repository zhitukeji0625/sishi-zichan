"""功能完整性：核心公开 API 行为与契约。"""

from sishi_zichan import health_check, project_info


def test_project_info_shape_and_values():
    info = project_info()
    assert isinstance(info, dict)
    assert info["name"] == "sishi-zichan"
    assert info["version"] == "0.1.0"


def test_health_check_ok():
    body = health_check()
    assert body == {"status": "ok"}
