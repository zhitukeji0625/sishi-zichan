import sishi_zichan


def test_version_is_non_empty_string():
    v = sishi_zichan.version()
    assert isinstance(v, str)
    assert len(v) > 0


def test_version_semver_shape():
    v = sishi_zichan.version()
    parts = v.split(".")
    assert len(parts) >= 2
    assert all(p.isdigit() for p in parts[:2])
