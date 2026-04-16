import sishi_zichan


def test_version_is_semantic_string() -> None:
    assert isinstance(sishi_zichan.__version__, str)
    parts = sishi_zichan.__version__.split(".")
    assert len(parts) >= 2
    assert all(p.isdigit() for p in parts[:2])


def test_health_check_returns_ok() -> None:
    payload = sishi_zichan.health_check()
    assert payload["status"] == "ok"
    assert payload["version"] == sishi_zichan.__version__
