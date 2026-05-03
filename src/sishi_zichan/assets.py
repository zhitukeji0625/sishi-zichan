from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Dict, List, Optional


@dataclass(frozen=True)
class Asset:
    """In-memory asset record."""

    id: str
    name: str
    value: Decimal


class AssetStore:
    """Simple keyed store for assets with duplicate-id protection."""

    def __init__(self) -> None:
        self._items: Dict[str, Asset] = {}

    def add(self, asset: Asset) -> None:
        if asset.id in self._items:
            raise ValueError(f"duplicate asset id: {asset.id!r}")
        self._items[asset.id] = asset

    def get(self, asset_id: str) -> Optional[Asset]:
        return self._items.get(asset_id)

    def list_all(self) -> List[Asset]:
        return list(self._items.values())

    def total_value(self) -> Decimal:
        return sum((a.value for a in self._items.values()), start=Decimal("0"))
