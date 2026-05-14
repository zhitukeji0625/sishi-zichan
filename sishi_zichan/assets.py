"""内存资产存储，满足完整性测试所需的最小 CRUD。"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Optional
from uuid import uuid4


@dataclass
class Asset:
    """单条资产记录。"""

    name: str
    id: str = field(default_factory=lambda: str(uuid4()))
    value: float = 0.0


class AssetStore:
    """进程内资产仓库。"""

    def __init__(self) -> None:
        self._items: Dict[str, Asset] = {}

    def create(self, name: str, value: float = 0.0) -> Asset:
        asset = Asset(name=name, value=value)
        self._items[asset.id] = asset
        return asset

    def get(self, asset_id: str) -> Optional[Asset]:
        return self._items.get(asset_id)

    def update(self, asset_id: str, *, name: Optional[str] = None, value: Optional[float] = None) -> Optional[Asset]:
        asset = self._items.get(asset_id)
        if asset is None:
            return None
        if name is not None:
            asset.name = name
        if value is not None:
            asset.value = value
        return asset

    def delete(self, asset_id: str) -> bool:
        if asset_id not in self._items:
            return False
        del self._items[asset_id]
        return True

    def list_all(self) -> list[Asset]:
        return list(self._items.values())
