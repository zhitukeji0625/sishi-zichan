"""健康检查相关单元测试。"""

from sishi_zichan import __version__
from sishi_zichan.health import is_healthy


def test_is_healthy():
    assert is_healthy() is True


def test_version_is_semverish():
    parts = __version__.split(".")
    assert len(parts) >= 2
    assert all(p.isdigit() for p in parts[:2])
