"""核心模块功能完整性测试。"""

import pytest

from sishi_zichan.core import health, version


def test_version_non_empty() -> None:
    assert version()
    assert isinstance(version(), str)


def test_health_shape() -> None:
    payload = health()
    assert payload["status"] == "ok"
    assert payload["version"] == version()


@pytest.mark.parametrize(
    "key",
    ["status", "version"],
)
def test_health_required_keys(key: str) -> None:
    assert key in health()
