"""资产工具：金额校验、资产标识规范化、元数据合并。"""

from __future__ import annotations

import math
from typing import Any, Optional


def validate_amount(value: float | int) -> bool:
    """金额必须为非负有限数。"""
    if not isinstance(value, (int, float)):
        return False
    if isinstance(value, bool):
        return False
    if math.isnan(value) or math.isinf(value):
        return False
    return value >= 0


def format_asset_id(raw: str | None) -> str:
    """规范化资产标识：去首尾空白并转大写；空输入返回空串。"""
    if raw is None:
        return ""
    return raw.strip().upper()


def merge_metadata(*dicts: Optional[dict[str, Any]]) -> dict[str, Any]:
    """从左到右浅合并字典，后者覆盖前者同名键；跳过 None。"""
    out: dict[str, Any] = {}
    for d in dicts:
        if d is None:
            continue
        out.update(d)
    return out
