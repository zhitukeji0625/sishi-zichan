"""核心功能完整性测试。"""

from sishi_zichan import __version__, health


def test_version_is_non_empty_string():
    assert isinstance(__version__, str)
    assert len(__version__) > 0


def test_health_returns_ok_status():
    payload = health()
    assert payload["status"] == "ok"
    assert payload["version"] == __version__
