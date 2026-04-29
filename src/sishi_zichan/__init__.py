"""四时资产：资产条目汇总。"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Iterable, Mapping


@dataclass(frozen=True)
class AssetLine:
    """单条资产：名称与金额（非负）。"""

    name: str
    amount: Decimal

    def __post_init__(self) -> None:
        if not self.name or not str(self.name).strip():
            raise ValueError("资产名称不能为空")
        if self.amount < 0:
            raise ValueError("金额不能为负")


def total_amount(lines: Iterable[AssetLine]) -> Decimal:
    """汇总多条资产金额。"""
    return sum((line.amount for line in lines), start=Decimal("0"))


def total_from_mapping(amounts: Mapping[str, Decimal]) -> Decimal:
    """从「名称 -> 金额」映射构建汇总（跳过空名称）。"""
    lines = [
        AssetLine(name=k.strip(), amount=v)
        for k, v in amounts.items()
        if k and str(k).strip()
    ]
    return total_amount(lines)
