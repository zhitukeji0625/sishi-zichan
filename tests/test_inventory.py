import pytest

from sishi_zichan.inventory import summarize_quantities


def test_empty():
    assert summarize_quantities([]) == {}


def test_merge_case_and_whitespace():
    got = summarize_quantities(
        [
            ("  SKU-A ", 2),
            ("sku-a", 3),
            ("SKU-A", 1),
        ]
    )
    assert got == {"sku-a": 6}


def test_rejects_negative_quantity():
    with pytest.raises(ValueError, match="非负整数"):
        summarize_quantities([("a", -1)])


def test_rejects_non_int_quantity():
    with pytest.raises(ValueError, match="非负整数"):
        summarize_quantities([("a", 1.5)])  # type: ignore[list-item]
