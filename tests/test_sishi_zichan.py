import pytest

from sishi_zichan import normalize_asset_id, summarize_holdings


def test_normalize_asset_id_trims_and_lowercases():
    assert normalize_asset_id("  ABC-123  ") == "abc-123"


def test_normalize_asset_id_rejects_empty():
    with pytest.raises(ValueError, match="不能为空"):
        normalize_asset_id("")
    with pytest.raises(ValueError, match="不能为空"):
        normalize_asset_id("   ")


def test_normalize_asset_id_rejects_none():
    with pytest.raises(TypeError, match="None"):
        normalize_asset_id(None)  # type: ignore[arg-type]


def test_summarize_holdings():
    assert summarize_holdings(3, 100.5) == "共 3 项持仓，合计 100.50"


def test_summarize_holdings_rejects_negative():
    with pytest.raises(ValueError, match="数量"):
        summarize_holdings(-1, 0.0)
    with pytest.raises(ValueError, match="总价值"):
        summarize_holdings(0, -1.0)
