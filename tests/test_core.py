import sishi_zichan


def test_version_is_semver_like():
    parts = sishi_zichan.__version__.split(".")
    assert len(parts) >= 2
    assert all(p.isdigit() for p in parts[:2])


def test_health_returns_ok():
    body = sishi_zichan.health()
    assert body["status"] == "ok"
    assert body["version"] == sishi_zichan.__version__
