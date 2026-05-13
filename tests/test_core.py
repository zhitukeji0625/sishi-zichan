import pytest

from sishi_zichan import __version__
from sishi_zichan.core import normalize_name


def test_version_defined():
    assert __version__


def test_normalize_name_ok():
    assert normalize_name("  foo  ") == "foo"


def test_normalize_name_empty_raises():
    with pytest.raises(ValueError):
        normalize_name("   ")


def test_normalize_name_not_str_raises():
    with pytest.raises(TypeError):
        normalize_name(1)  # type: ignore[arg-type]
