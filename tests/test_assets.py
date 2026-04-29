"""资产汇总逻辑测试。"""

from decimal import Decimal

import pytest

from sishi_zichan import AssetLine, total_amount, total_from_mapping


def test_total_amount_empty() -> None:
    assert total_amount([]) == Decimal("0")


def test_total_amount_sum() -> None:
    lines = [
        AssetLine("现金", Decimal("100")),
        AssetLine("存款", Decimal("200.5")),
    ]
    assert total_amount(lines) == Decimal("300.5")


def test_asset_line_negative_rejected() -> None:
    with pytest.raises(ValueError, match="不能为负"):
        AssetLine("x", Decimal("-1"))


def test_asset_line_empty_name() -> None:
    with pytest.raises(ValueError, match="不能为空"):
        AssetLine("", Decimal("1"))
    with pytest.raises(ValueError, match="不能为空"):
        AssetLine("   ", Decimal("1"))


def test_total_from_mapping() -> None:
    m = {"a": Decimal("10"), "b": Decimal("20")}
    assert total_from_mapping(m) == Decimal("30")


def test_total_from_mapping_skips_empty_keys() -> None:
    assert total_from_mapping({"": Decimal("99"), "ok": Decimal("1")}) == Decimal("1")
