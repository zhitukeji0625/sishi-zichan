import pytest

from sishi_zichan.core import summarize_assets


def test_summarize_assets_ok():
    assert summarize_assets(3, 100.5) == "assets=3, total=100.50"


def test_summarize_assets_zero():
    assert summarize_assets(0, 0.0) == "assets=0, total=0.00"


@pytest.mark.parametrize(
    ("count", "total", "msg"),
    [
        (-1, 0.0, "count"),
        (0, -0.01, "total_value"),
    ],
)
def test_summarize_assets_invalid(count, total, msg):
    with pytest.raises(ValueError, match=msg):
        summarize_assets(count, total)
