"""资产登记：创建、查询、列举、删除。"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterator


class AssetError(ValueError):
    """资产操作非法或不存在。"""


@dataclass(frozen=True)
class Asset:
    id: str
    name: str
    value: float


class AssetRegistry:
    """内存中的资产表，用于功能完整性验收。"""

    def __init__(self) -> None:
        self._by_id: dict[str, Asset] = {}
        self._counter = 0

    def create(self, name: str, value: float) -> Asset:
        if not name or not name.strip():
            raise AssetError("资产名称不能为空")
        if value < 0:
            raise AssetError("资产价值不能为负")
        self._counter += 1
        aid = f"a-{self._counter}"
        asset = Asset(id=aid, name=name.strip(), value=float(value))
        self._by_id[aid] = asset
        return asset

    def get(self, asset_id: str) -> Asset:
        if asset_id not in self._by_id:
            raise AssetError(f"资产不存在: {asset_id}")
        return self._by_id[asset_id]

    def list_all(self) -> list[Asset]:
        return list(self._by_id.values())

    def iter_ids(self) -> Iterator[str]:
        yield from self._by_id

    def delete(self, asset_id: str) -> None:
        if asset_id not in self._by_id:
            raise AssetError(f"资产不存在: {asset_id}")
        del self._by_id[asset_id]

    def count(self) -> int:
        return len(self._by_id)
