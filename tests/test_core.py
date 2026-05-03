import pytest

from sishi_zichan import __version__, health, normalize_label


def test_version_is_semver_like() -> None:
    parts = __version__.split(".")
    assert len(parts) >= 2
    assert all(p.isdigit() for p in parts[:2])


def test_health_payload() -> None:
    h = health()
    assert h["status"] == "ok"
    assert h["service"] == "sishi-zichan"


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("  hello  world  ", "hello world"),
        ("", ""),
        ("   ", ""),
        ("single", "single"),
    ],
)
def test_normalize_label(raw: str, expected: str) -> None:
    assert normalize_label(raw) == expected
