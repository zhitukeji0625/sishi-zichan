import sishi_zichan


def test_version_is_non_empty_string():
    v = sishi_zichan.version()
    assert isinstance(v, str)
    assert len(v) > 0


def test_ping_returns_ok():
    assert sishi_zichan.ping() == "ok"
