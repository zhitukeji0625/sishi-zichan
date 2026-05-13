from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import List


@dataclass(frozen=True)
class Asset:
    id: str
    name: str
    created_at: str


class AssetStore:
    """内存中的资产登记，供集成测试与本地原型使用。"""

    def __init__(self) -> None:
        self._items: dict[str, Asset] = {}

    def add(self, asset_id: str, name: str) -> Asset:
        if asset_id in self._items:
            raise ValueError("duplicate id")
        ts = datetime.now(timezone.utc).isoformat()
        asset = Asset(id=asset_id, name=name, created_at=ts)
        self._items[asset_id] = asset
        return asset

    def get(self, asset_id: str) -> Asset | None:
        return self._items.get(asset_id)

    def list_all(self) -> List[Asset]:
        return list(self._items.values())
