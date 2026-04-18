"""资产管理：资产条目与组合汇总。"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Iterator


@dataclass(frozen=True)
class Asset:
    """单条资产。"""

    asset_id: str
    name: str
    value: Decimal

    def __post_init__(self) -> None:
        if not self.asset_id.strip():
            raise ValueError("asset_id 不能为空")
        if not self.name.strip():
            raise ValueError("name 不能为空")
        if self.value < 0:
            raise ValueError("资产金额不能为负数")


class Portfolio:
    """资产组合：按 id 唯一，可增删改查与汇总。"""

    def __init__(self) -> None:
        self._items: dict[str, Asset] = {}

    def add(self, asset: Asset) -> None:
        if asset.asset_id in self._items:
            raise ValueError(f"资产 id 已存在: {asset.asset_id}")
        self._items[asset.asset_id] = asset

    def upsert(self, asset: Asset) -> None:
        """存在则覆盖，不存在则新增。"""
        self._items[asset.asset_id] = asset

    def get(self, asset_id: str) -> Asset | None:
        return self._items.get(asset_id)

    def remove(self, asset_id: str) -> bool:
        """删除指定 id；若不存在返回 False。"""
        if asset_id not in self._items:
            return False
        del self._items[asset_id]
        return True

    def __len__(self) -> int:
        return len(self._items)

    def __iter__(self) -> Iterator[Asset]:
        return iter(self._items.values())

    def total_value(self) -> Decimal:
        return sum((a.value for a in self._items.values()), start=Decimal("0"))
