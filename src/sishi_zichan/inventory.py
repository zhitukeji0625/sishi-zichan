"""资产清单相关计算。"""

from __future__ import annotations

from typing import Any, Mapping


def total_asset_value(items: list[Mapping[str, Any]]) -> float:
    """对若干条资产记录求价值总和。

    每条记录应包含数值字段 ``value``；缺失或非数值时按 0 处理。
    """
    total = 0.0
    for item in items:
        raw = item.get("value", 0)
        try:
            total += float(raw)
        except (TypeError, ValueError):
            continue
    return total
