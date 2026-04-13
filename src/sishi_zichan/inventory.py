from __future__ import annotations

from dataclasses import dataclass
from typing import Iterator


@dataclass(frozen=True, slots=True)
class Asset:
    """单项资产。"""

    asset_id: str
    name: str
    value_cents: int

    def __post_init__(self) -> None:
        if not self.asset_id.strip():
            raise ValueError("asset_id 不能为空")
        if not self.name.strip():
            raise ValueError("name 不能为空")
        if self.value_cents < 0:
            raise ValueError("value_cents 不能为负")


class Inventory:
    """按 asset_id 唯一索引的库存。"""

    def __init__(self) -> None:
        self._items: dict[str, Asset] = {}

    def add(self, asset: Asset) -> None:
        if asset.asset_id in self._items:
            raise KeyError(f"资产已存在: {asset.asset_id}")
        self._items[asset.asset_id] = asset

    def remove(self, asset_id: str) -> Asset:
        if asset_id not in self._items:
            raise KeyError(f"资产不存在: {asset_id}")
        return self._items.pop(asset_id)

    def get(self, asset_id: str) -> Asset:
        if asset_id not in self._items:
            raise KeyError(f"资产不存在: {asset_id}")
        return self._items[asset_id]

    def __len__(self) -> int:
        return len(self._items)

    def __iter__(self) -> Iterator[Asset]:
        return iter(self._items.values())

    def total_value_cents(self) -> int:
        return sum(a.value_cents for a in self._items.values())
