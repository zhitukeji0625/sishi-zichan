"""持仓与资产汇总（纯函数，便于单测）。"""

from __future__ import annotations

from typing import Any, Iterable, Mapping


def summarize_positions(
    positions: Iterable[Mapping[str, float]],
) -> dict[str, Any]:
    """
    将多条持仓记录按标的合并数量，并给出总价值。

    每条记录需包含键: symbol, quantity, price（均为非负数）。
    """
    by_symbol: dict[str, dict[str, float]] = {}

    for row in positions:
        symbol = str(row["symbol"]).strip()
        if not symbol:
            raise ValueError("symbol 不能为空")
        quantity = float(row["quantity"])
        price = float(row["price"])
        if quantity < 0 or price < 0:
            raise ValueError("quantity 与 price 必须为非负数")

        bucket = by_symbol.setdefault(symbol, {"quantity": 0.0, "value": 0.0})
        line_value = quantity * price
        bucket["quantity"] += quantity
        bucket["value"] += line_value

    total_value = sum(b["value"] for b in by_symbol.values())
    return {"by_symbol": by_symbol, "total_value": total_value}
