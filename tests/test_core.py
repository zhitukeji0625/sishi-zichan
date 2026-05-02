"""Tests for sishi_zichan.core."""

import pytest

from sishi_zichan.core import normalize_name, project_title


def test_project_title():
    assert project_title() == "sishi-zichan"


def test_normalize_name_trims():
    assert normalize_name("  hello  ") == "hello"


def test_normalize_name_rejects_empty():
    with pytest.raises(ValueError, match="empty"):
        normalize_name("")
    with pytest.raises(ValueError, match="empty"):
        normalize_name("   ")


def test_normalize_name_rejects_non_string():
    with pytest.raises(TypeError, match="string"):
        normalize_name(123)  # type: ignore[arg-type]
