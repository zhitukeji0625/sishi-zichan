"""核心 API 完整性测试。"""

from sishi_zichan import ping


def test_ping_returns_ok():
    assert ping() == "ok"
