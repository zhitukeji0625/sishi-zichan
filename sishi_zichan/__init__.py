"""四时资产：资产条目校验与汇总。"""

from __future__ import annotations

from typing import Any, TypedDict


class AssetItem(TypedDict):
    """单条资产记录。"""

    name: str
    amount: float


def validate_asset_item(item: Any) -> None:
    """校验资产条目包含合法字段。"""
    if not isinstance(item, dict):
        raise TypeError("资产条目必须是字典")
    if "name" not in item or "amount" not in item:
        raise ValueError("资产条目必须包含 name 与 amount")
    if not isinstance(item["name"], str) or not item["name"].strip():
        raise ValueError("name 必须为非空字符串")
    amount = item["amount"]
    if not isinstance(amount, (int, float)):
        raise TypeError("amount 必须为数字")
    if amount < 0:
        raise ValueError("amount 不可为负数")


def sum_assets(items: list[dict[str, Any]]) -> float:
    """对资产列表求和；会先校验每条记录。"""
    total = 0.0
    for item in items:
        validate_asset_item(item)
        total += float(item["amount"])
    return total


def format_total_cny(total: float) -> str:
    """格式化为人民币展示字符串（两位小数）。"""
    return f"¥{total:,.2f}"
