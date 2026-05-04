from __future__ import annotations

from dataclasses import dataclass
from typing import Iterator


def get_version() -> str:
    return "0.1.0"


@dataclass(frozen=True, slots=True)
class Asset:
    """一条资产记录。"""

    asset_id: str
    name: str
    value_cents: int

    def __post_init__(self) -> None:
        if not self.asset_id or not self.asset_id.strip():
            raise ValueError("asset_id 不能为空")
        if not self.name or not self.name.strip():
            raise ValueError("name 不能为空")
        if self.value_cents < 0:
            raise ValueError("value_cents 不能为负")


class AssetRegistry:
    """内存中的资产表，支持增删改查与列表。"""

    def __init__(self) -> None:
        self._by_id: dict[str, Asset] = {}

    def add(self, asset: Asset) -> None:
        if asset.asset_id in self._by_id:
            raise KeyError(f"资产已存在: {asset.asset_id}")
        self._by_id[asset.asset_id] = asset

    def get(self, asset_id: str) -> Asset:
        try:
            return self._by_id[asset_id]
        except KeyError as e:
            raise KeyError(f"未找到资产: {asset_id}") from e

    def update(self, asset: Asset) -> None:
        if asset.asset_id not in self._by_id:
            raise KeyError(f"未找到资产: {asset.asset_id}")
        self._by_id[asset.asset_id] = asset

    def delete(self, asset_id: str) -> None:
        if asset_id not in self._by_id:
            raise KeyError(f"未找到资产: {asset_id}")
        del self._by_id[asset_id]

    def list_all(self) -> list[Asset]:
        return list(self._by_id.values())

    def iter_sorted_by_id(self) -> Iterator[Asset]:
        for aid in sorted(self._by_id):
            yield self._by_id[aid]

    def count(self) -> int:
        return len(self._by_id)
