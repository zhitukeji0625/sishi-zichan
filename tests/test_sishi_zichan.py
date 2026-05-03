import sishi_zichan


def test_version_is_semantic_string():
    assert isinstance(sishi_zichan.__version__, str)
    parts = sishi_zichan.__version__.split(".")
    assert len(parts) >= 2
    assert all(p.isdigit() for p in parts[:2])


def test_health_returns_ok_status():
    payload = sishi_zichan.health()
    assert payload["status"] == "ok"
    assert payload["service"] == "sishi-zichan"
