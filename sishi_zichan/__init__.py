"""sishi-zichan：资产校验与基础元数据。"""

from __future__ import annotations

__version__ = "0.1.0"


def validate_asset_record(name: str, value_cents: int) -> tuple[bool, str | None]:
    """
    校验单条资产记录。

    返回 (是否有效, 错误信息)；有效时错误信息为 None。
    """
    if not name or not str(name).strip():
        return False, "名称不能为空"
    if value_cents < 0:
        return False, "金额不能为负"
    return True, None


def summarize_assets(records: list[tuple[str, int]]) -> dict[str, int]:
    """
    按名称汇总金额（分）。名称会做 strip 规范化。
    """
    totals: dict[str, int] = {}
    for name, cents in records:
        key = str(name).strip()
        if not key:
            continue
        totals[key] = totals.get(key, 0) + int(cents)
    return totals
