from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from typing import Dict


@dataclass
class Asset:
    """单项资产：标识、名称与金额（非负）。"""

    asset_id: str
    name: str
    value: Decimal

    def __post_init__(self) -> None:
        if not self.asset_id or not self.asset_id.strip():
            raise ValueError("asset_id 不能为空")
        if not self.name or not self.name.strip():
            raise ValueError("name 不能为空")
        if self.value < 0:
            raise ValueError("value 不能为负")

    @property
    def total_value(self) -> Decimal:
        return self.value


@dataclass
class Portfolio:
    """资产组合：按 id 管理多条资产并汇总总价值。"""

    _items: Dict[str, Asset] = field(default_factory=dict)

    def add(self, asset: Asset) -> None:
        if asset.asset_id in self._items:
            raise ValueError(f"资产 id 已存在: {asset.asset_id}")
        self._items[asset.asset_id] = asset

    def get(self, asset_id: str) -> Asset | None:
        return self._items.get(asset_id)

    def total_value(self) -> Decimal:
        return sum((a.value for a in self._items.values()), start=Decimal("0"))

    def count(self) -> int:
        return len(self._items)
