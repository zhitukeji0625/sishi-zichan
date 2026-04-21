from __future__ import annotations

from dataclasses import dataclass
from typing import Iterator


@dataclass(frozen=True, slots=True)
class Asset:
    """单项资产。"""

    asset_id: str
    name: str
    value: float

    def __post_init__(self) -> None:
        if not self.asset_id or not self.asset_id.strip():
            raise ValueError("asset_id 不能为空")
        if self.value < 0:
            raise ValueError("资产金额不能为负数")


class AssetRegistry:
    """内存中的资产登记簿，用于功能完整性测试与演示。"""

    def __init__(self) -> None:
        self._items: dict[str, Asset] = {}

    def add(self, asset: Asset) -> None:
        if asset.asset_id in self._items:
            raise KeyError(f"资产已存在: {asset.asset_id}")
        self._items[asset.asset_id] = asset

    def get(self, asset_id: str) -> Asset:
        try:
            return self._items[asset_id]
        except KeyError as exc:
            raise KeyError(f"未找到资产: {asset_id}") from exc

    def list_all(self) -> list[Asset]:
        return list(self._items.values())

    def iter_assets(self) -> Iterator[Asset]:
        yield from self._items.values()

    def total_value(self) -> float:
        return sum(a.value for a in self._items.values())

    def remove(self, asset_id: str) -> None:
        if asset_id not in self._items:
            raise KeyError(f"未找到资产: {asset_id}")
        del self._items[asset_id]
