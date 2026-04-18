from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Iterator, Mapping


@dataclass(frozen=True)
class Asset:
    """单项资产：唯一标识、名称与金额（非负）。"""

    asset_id: str
    name: str
    amount: float

    def __post_init__(self) -> None:
        if not self.asset_id.strip():
            raise ValueError("asset_id 不能为空")
        if not self.name.strip():
            raise ValueError("name 不能为空")
        if self.amount < 0:
            raise ValueError("amount 不能为负数")


class Portfolio:
    """按 asset_id 管理多条资产并提供汇总。"""

    def __init__(self) -> None:
        self._items: Dict[str, Asset] = {}

    def upsert(self, asset: Asset) -> None:
        self._items[asset.asset_id] = asset

    def remove(self, asset_id: str) -> bool:
        return self._items.pop(asset_id, None) is not None

    def get(self, asset_id: str) -> Asset | None:
        return self._items.get(asset_id)

    def __len__(self) -> int:
        return len(self._items)

    def __iter__(self) -> Iterator[Asset]:
        return iter(self._items.values())

    def items(self) -> Mapping[str, Asset]:
        return dict(self._items)

    def total_amount(self) -> float:
        return sum(a.amount for a in self._items.values())
