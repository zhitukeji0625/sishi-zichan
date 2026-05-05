from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterator


@dataclass(frozen=True, slots=True)
class Asset:
    """单条资产记录。"""

    asset_id: str
    name: str
    value: float

    def __post_init__(self) -> None:
        if not self.asset_id or not self.asset_id.strip():
            raise ValueError("asset_id 不能为空")
        name = self.name.strip()
        if not name:
            raise ValueError("name 不能为空")
        object.__setattr__(self, "name", name)
        if self.value < 0 or not isinstance(self.value, (int, float)):
            raise ValueError("value 必须为非负有限数字")
        if self.value != self.value:  # NaN
            raise ValueError("value 不能为 NaN")


@dataclass
class AssetStore:
    """内存资产表：按 asset_id 唯一。"""

    _items: dict[str, Asset] = field(default_factory=dict)

    def upsert(self, asset: Asset) -> None:
        self._items[asset.asset_id] = asset

    def get(self, asset_id: str) -> Asset | None:
        return self._items.get(asset_id)

    def remove(self, asset_id: str) -> bool:
        if asset_id in self._items:
            del self._items[asset_id]
            return True
        return False

    def __iter__(self) -> Iterator[Asset]:
        return iter(self._items.values())

    def total_value(self) -> float:
        return sum(a.value for a in self._items.values())

    def count(self) -> int:
        return len(self._items)
