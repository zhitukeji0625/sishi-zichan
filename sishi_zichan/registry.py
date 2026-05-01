from __future__ import annotations

from dataclasses import dataclass
from typing import Iterator


@dataclass(frozen=True)
class Asset:
    """A single line item with quantity and unit value."""

    id: str
    name: str
    quantity: float
    unit_value: float

    def line_total(self) -> float:
        if self.quantity < 0:
            raise ValueError("quantity must be non-negative")
        if self.unit_value < 0:
            raise ValueError("unit_value must be non-negative")
        return self.quantity * self.unit_value


class AssetRegistry:
    """In-memory registry keyed by asset id."""

    def __init__(self) -> None:
        self._items: dict[str, Asset] = {}

    def add(self, asset: Asset) -> None:
        if not asset.id:
            raise ValueError("asset id must be non-empty")
        self._items[asset.id] = asset

    def get(self, asset_id: str) -> Asset | None:
        return self._items.get(asset_id)

    def remove(self, asset_id: str) -> bool:
        if asset_id in self._items:
            del self._items[asset_id]
            return True
        return False

    def __iter__(self) -> Iterator[Asset]:
        return iter(self._items.values())

    def total_value(self) -> float:
        return sum(a.line_total() for a in self._items.values())
