from __future__ import annotations

from dataclasses import dataclass
from typing import Iterator


@dataclass(frozen=True, slots=True)
class Asset:
    """单条资产记录。"""

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
    """按 asset_id 去重的内存清单。"""

    def __init__(self) -> None:
        self._items: dict[str, Asset] = {}

    def upsert(self, asset: Asset) -> None:
        self._items[asset.asset_id] = asset

    def get(self, asset_id: str) -> Asset | None:
        return self._items.get(asset_id)

    def remove(self, asset_id: str) -> bool:
        if asset_id in self._items:
            del self._items[asset_id]
            return True
        return False

    def list_all(self) -> list[Asset]:
        return sorted(self._items.values(), key=lambda a: a.asset_id)

    def total_value_cents(self) -> int:
        return sum(a.value_cents for a in self._items.values())

    def __iter__(self) -> Iterator[Asset]:
        return iter(self.list_all())

    def __len__(self) -> int:
        return len(self._items)
