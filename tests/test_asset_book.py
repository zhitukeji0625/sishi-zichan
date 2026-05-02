import pytest

from sishi_zichan import AssetBook, format_currency_cny


def test_add_and_total():
    book = AssetBook()
    book.add("现金", 100.0)
    book.add("存款", 200.5)
    assert book.total() == pytest.approx(300.5)


def test_get():
    book = AssetBook()
    book.add("基金", 50)
    assert book.get("基金") == 50.0
    assert book.get("不存在") is None


def test_names_sorted():
    book = AssetBook()
    book.add("b", 1)
    book.add("a", 2)
    assert list(book.names()) == ["a", "b"]


def test_reject_empty_name():
    book = AssetBook()
    with pytest.raises(ValueError, match="名称"):
        book.add("", 1)
    with pytest.raises(ValueError, match="名称"):
        book.add("   ", 1)


def test_reject_negative_value():
    book = AssetBook()
    with pytest.raises(ValueError, match="负"):
        book.add("x", -1)


def test_format_currency_cny():
    assert format_currency_cny(1234.5) == "¥1,234.50"
    assert format_currency_cny(0) == "¥0.00"
