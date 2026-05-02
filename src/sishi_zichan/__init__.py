"""私事资产：简单内存内资产记录与汇总。"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterator


@dataclass
class AssetBook:
    """用于记录多项资产及其金额。"""

    _items: dict[str, float] = field(default_factory=dict)

    def add(self, name: str, value: float) -> None:
        if not name or not str(name).strip():
            raise ValueError("资产名称不能为空")
        if value < 0:
            raise ValueError("资产金额不能为负")
        self._items[name.strip()] = float(value)

    def get(self, name: str) -> float | None:
        return self._items.get(name)

    def total(self) -> float:
        return sum(self._items.values())

    def names(self) -> Iterator[str]:
        return iter(sorted(self._items.keys()))


def format_currency_cny(amount: float) -> str:
    """格式化为人民币两位小数字符串。"""
    return f"¥{amount:,.2f}"
