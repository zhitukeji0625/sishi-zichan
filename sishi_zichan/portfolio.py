from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterator


@dataclass(frozen=True)
class Asset:
    """单项资产。"""

    asset_id: str
    name: str
    amount: float

    def __post_init__(self) -> None:
        if not self.asset_id or not self.asset_id.strip():
            raise ValueError("asset_id 不能为空")
        if self.amount < 0:
            raise ValueError("amount 不能为负数")


@dataclass
class Portfolio:
    """资产组合：按 asset_id 唯一，可汇总总价值。"""

    _assets: dict[str, Asset] = field(default_factory=dict)

    def add(self, asset: Asset) -> None:
        if asset.asset_id in self._assets:
            raise ValueError(f"资产已存在: {asset.asset_id}")
        self._assets[asset.asset_id] = asset

    def remove(self, asset_id: str) -> Asset:
        if asset_id not in self._assets:
            raise KeyError(asset_id)
        return self._assets.pop(asset_id)

    def get(self, asset_id: str) -> Asset | None:
        return self._assets.get(asset_id)

    def total_value(self) -> float:
        return sum(a.amount for a in self._assets.values())

    def __len__(self) -> int:
        return len(self._assets)

    def __iter__(self) -> Iterator[Asset]:
        return iter(self._assets.values())
