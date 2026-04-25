import pytest

from sishi_zichan import __version__
from sishi_zichan.core import normalize_name, summarize_assets


def test_version():
    assert __version__ == "0.1.0"


def test_normalize_name_ok():
    assert normalize_name("  foo  ") == "foo"


def test_normalize_name_empty():
    with pytest.raises(ValueError):
        normalize_name("   ")


def test_normalize_name_type():
    with pytest.raises(TypeError):
        normalize_name(1)  # type: ignore[arg-type]


def test_summarize_assets_empty():
    assert summarize_assets([]) == {"count": 0, "total_value": 0.0}


def test_summarize_assets_sum():
    out = summarize_assets(
        [
            {"name": "a", "value": 10},
            {"name": "b", "value": 2.5},
        ]
    )
    assert out == {"count": 2, "total_value": 12.5}


def test_summarize_assets_invalid_item():
    with pytest.raises(TypeError):
        summarize_assets([1])  # type: ignore[list-item]


def test_summarize_assets_bad_value():
    with pytest.raises(ValueError):
        summarize_assets([{"value": "x"}])
