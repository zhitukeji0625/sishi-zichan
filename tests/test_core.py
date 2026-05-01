import pytest

from sishi_zichan import __version__, normalize_name


def test_version():
    assert __version__ == "0.1.0"


def test_normalize_name_ok():
    assert normalize_name("  foo  ") == "foo"


def test_normalize_name_empty():
    with pytest.raises(ValueError):
        normalize_name("   ")
