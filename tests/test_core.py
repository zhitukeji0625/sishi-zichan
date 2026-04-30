import pytest

from sishi_zichan.core import normalize_label


def test_normalize_label_trims_and_collapses():
    assert normalize_label("  a   b  c  ") == "a b c"


def test_normalize_label_empty():
    assert normalize_label("") == ""
    assert normalize_label("   ") == ""


def test_normalize_label_none_raises():
    with pytest.raises(TypeError):
        normalize_label(None)  # type: ignore[arg-type]
