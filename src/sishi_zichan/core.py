"""核心业务逻辑（占位实现，供测试覆盖）。"""

from __future__ import annotations

from typing import Any


def normalize_name(name: str) -> str:
    """返回去掉首尾空白后的名称；空串视为无效。"""
    if not isinstance(name, str):
        raise TypeError("name 必须为 str")
    stripped = name.strip()
    if not stripped:
        raise ValueError("name 不能为空")
    return stripped


def summarize_assets(items: list[dict[str, Any]]) -> dict[str, Any]:
    """
    对资产条目列表做简单汇总：数量与 value 字段之和（缺失则按 0）。
    items 中每项应为 mapping，可含键 "value"（数字）。
    """
    if not isinstance(items, list):
        raise TypeError("items 必须为 list")
    total_value = 0.0
    for i, row in enumerate(items):
        if not isinstance(row, dict):
            raise TypeError(f"第 {i} 项必须为 dict")
        raw = row.get("value", 0)
        try:
            total_value += float(raw)
        except (TypeError, ValueError) as e:
            raise ValueError(f"第 {i} 项 value 无法转为数字: {raw!r}") from e
    return {"count": len(items), "total_value": total_value}
