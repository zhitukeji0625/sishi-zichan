"""核心模块功能完整性测试。"""

import pytest

from sishi_zichan import __version__
from sishi_zichan.core import add, health


def test_version_defined():
    assert __version__
    assert isinstance(__version__, str)


def test_health_returns_ok_status():
    result = health()
    assert result == {"status": "ok"}


@pytest.mark.parametrize(
    ("a", "b", "expected"),
    [(0, 0, 0), (1, 2, 3), (-1, 1, 0)],
)
def test_add(a, b, expected):
    assert add(a, b) == expected
