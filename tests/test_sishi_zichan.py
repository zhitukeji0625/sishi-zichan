from __future__ import annotations

import sishi_zichan


def test_version_is_string():
    assert isinstance(sishi_zichan.__version__, str)
    assert len(sishi_zichan.__version__) > 0


def test_health_returns_expected_shape():
    h = sishi_zichan.health()
    assert h["status"] == "ok"
    assert h["ready"] is True
    assert h["version"] == sishi_zichan.__version__


def test_is_ready():
    assert sishi_zichan.is_ready() is True
