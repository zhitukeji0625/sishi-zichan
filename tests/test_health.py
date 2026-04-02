from sishi_zichan.health import health_status


def test_health_status_returns_ok():
    assert health_status() == {"status": "ok"}
