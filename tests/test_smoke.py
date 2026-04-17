"""冒烟测试：验证包可导入且基础 API 可用。"""

from sishi_zichan import __version__, ping


def test_version_is_semver_shape() -> None:
    parts = __version__.split(".")
    assert len(parts) >= 2
    assert all(p.isdigit() for p in parts[:2])


def test_ping() -> None:
    assert ping() == "ok"
