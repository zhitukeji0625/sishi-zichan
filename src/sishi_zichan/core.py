"""核心计算逻辑."""

from __future__ import annotations

from typing import TypedDict


class Holding(TypedDict):
    """单条持仓：数量与单价须为非负数。"""

    quantity: float
    price: float


def validate_holding(h: Holding) -> None:
    if h["quantity"] < 0 or h["price"] < 0:
        raise ValueError("quantity 与 price 必须为非负数")


def calculate_total_value(holdings: list[Holding]) -> float:
    """计算持仓列表的总市值（数量 × 单价 之和）。"""
    total = 0.0
    for h in holdings:
        validate_holding(h)
        total += h["quantity"] * h["price"]
    return total
