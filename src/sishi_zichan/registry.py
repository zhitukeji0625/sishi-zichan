"""内存资产登记表。"""

from __future__ import annotations

from typing import Iterator

from sishi_zichan.errors import AssetExistsError, AssetNotFoundError
from sishi_zichan.models import Asset


class AssetRegistry:
    """按 asset_id 唯一索引的资产集合。"""

    def __init__(self) -> None:
        self._items: dict[str, Asset] = {}

    def register(self, asset: Asset) -> None:
        if asset.asset_id in self._items:
            raise AssetExistsError(asset.asset_id)
        self._items[asset.asset_id] = asset

    def get(self, asset_id: str) -> Asset:
        try:
            return self._items[asset_id]
        except KeyError as exc:
            raise AssetNotFoundError(asset_id) from exc

    def update(self, asset: Asset) -> None:
        if asset.asset_id not in self._items:
            raise AssetNotFoundError(asset.asset_id)
        self._items[asset.asset_id] = asset

    def remove(self, asset_id: str) -> None:
        try:
            del self._items[asset_id]
        except KeyError as exc:
            raise AssetNotFoundError(asset_id) from exc

    def __len__(self) -> int:
        return len(self._items)

    def __iter__(self) -> Iterator[Asset]:
        return iter(self._items.values())
