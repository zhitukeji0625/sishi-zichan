"""功能完整性：核心 API 行为测试。"""

from sishi_zichan import is_ready, version


def test_version_matches_expected() -> None:
    assert version() == "0.1.0"


def test_is_ready_true() -> None:
    assert is_ready() is True
