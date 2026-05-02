from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Iterable


@dataclass(frozen=True, slots=True)
class Asset:
    """单项资产：名称与金额（非负）。"""

    name: str
    amount: Decimal

    def __post_init__(self) -> None:
        if not self.name or not self.name.strip():
            raise ValueError("资产名称不能为空")
        if self.amount < 0:
            raise ValueError("金额不能为负数")


class Portfolio:
    """资产组合：可增删条目并计算总额。"""

    def __init__(self) -> None:
        self._items: list[Asset] = []

    def add(self, asset: Asset) -> None:
        self._items.append(asset)

    def remove_by_name(self, name: str) -> bool:
        """按名称删除第一条匹配记录；无匹配返回 False。"""
        target = name.strip()
        for i, a in enumerate(self._items):
            if a.name.strip() == target:
                del self._items[i]
                return True
        return False

    def iter_assets(self) -> Iterable[Asset]:
        return tuple(self._items)

    def total(self) -> Decimal:
        return sum((a.amount for a in self._items), start=Decimal("0"))

    def count(self) -> int:
        return len(self._items)
