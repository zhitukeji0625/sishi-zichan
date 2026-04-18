"""功能完整性：包可导入、健康检查契约稳定。"""

from sishi_zichan import health_check


def test_package_importable():
    assert callable(health_check)


def test_health_check_contract():
    payload = health_check()
    assert isinstance(payload, dict)
    assert payload.get("status") == "ok"
    assert "service" in payload
