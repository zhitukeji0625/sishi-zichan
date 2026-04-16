from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Any


@dataclass(frozen=True)
class AssetRecord:
    """单条资产记录（最小字段集）。"""

    name: str
    amount: Decimal
    currency: str = "CNY"


def parse_amount(value: Any) -> Decimal:
    """将用户输入解析为非负金额，非法或负数则抛出 ValueError。"""
    if value is None:
        raise ValueError("金额不能为空")
    if isinstance(value, Decimal):
        d = value
    elif isinstance(value, (int, float)):
        d = Decimal(str(value))
    else:
        s = str(value).strip()
        if not s:
            raise ValueError("金额不能为空")
        try:
            d = Decimal(s.replace(",", ""))
        except InvalidOperation as exc:
            raise ValueError("金额格式无效") from exc
    if d < 0:
        raise ValueError("金额不能为负数")
    return d


def normalize_record(name: str, amount: Any, currency: str = "CNY") -> AssetRecord:
    """校验并规范化一条资产记录。"""
    n = (name or "").strip()
    if not n:
        raise ValueError("名称不能为空")
    cur = (currency or "").strip().upper()
    if len(cur) != 3:
        raise ValueError("币种应为三位字母代码")
    amt = parse_amount(amount)
    return AssetRecord(name=n, amount=amt, currency=cur)


def total_assets(records: list[AssetRecord]) -> Decimal:
    """同币种求和；若币种不一致则抛出 ValueError。"""
    if not records:
        return Decimal("0")
    cur = records[0].currency
    for r in records:
        if r.currency != cur:
            raise ValueError("暂不支持多币种合并")
    return sum((r.amount for r in records), Decimal("0"))
