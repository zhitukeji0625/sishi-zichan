from __future__ import annotations

from dataclasses import dataclass
from typing import Iterator


class AssetError(ValueError):
    """资产数据不合法。"""


@dataclass(frozen=True)
class Asset:
    """单条资产记录。"""

    name: str
    amount: float
    category: str = "default"

    def __post_init__(self) -> None:
        if not (self.name or "").strip():
            raise AssetError("资产名称不能为空")
        if self.amount < 0:
            raise AssetError("金额不能为负数")
        if not (self.category or "").strip():
            raise AssetError("类别不能为空")


class AssetRegistry:
    """内存中的资产登记，支持增删与汇总。"""

    def __init__(self) -> None:
        self._items: list[Asset] = []

    def add(self, asset: Asset) -> None:
        self._items.append(asset)

    def remove_by_name(self, name: str) -> bool:
        """按名称删除第一条匹配记录；无匹配返回 False。"""
        key = name.strip()
        for i, a in enumerate(self._items):
            if a.name.strip() == key:
                del self._items[i]
                return True
        return False

    def __iter__(self) -> Iterator[Asset]:
        return iter(self._items)

    def __len__(self) -> int:
        return len(self._items)

    def total_amount(self) -> float:
        return sum(a.amount for a in self._items)

    def total_by_category(self) -> dict[str, float]:
        out: dict[str, float] = {}
        for a in self._items:
            c = a.category.strip()
            out[c] = out.get(c, 0.0) + a.amount
        return out
