from __future__ import annotations

from dataclasses import dataclass
from typing import Iterator


@dataclass(frozen=True)
class Asset:
    """A single named asset with a non-negative monetary value."""

    id: str
    name: str
    value: float

    def __post_init__(self) -> None:
        if not self.id.strip():
            raise ValueError("asset id must be non-empty")
        if self.value < 0:
            raise ValueError("asset value must be non-negative")


class AssetRegistry:
    """In-memory registry: add, remove, iterate, total value."""

    def __init__(self) -> None:
        self._by_id: dict[str, Asset] = {}

    def add(self, asset: Asset) -> None:
        if asset.id in self._by_id:
            raise KeyError(f"duplicate asset id: {asset.id!r}")
        self._by_id[asset.id] = asset

    def get(self, asset_id: str) -> Asset:
        return self._by_id[asset_id]

    def remove(self, asset_id: str) -> Asset:
        if asset_id not in self._by_id:
            raise KeyError(asset_id)
        return self._by_id.pop(asset_id)

    def __iter__(self) -> Iterator[Asset]:
        return iter(self._by_id.values())

    def __len__(self) -> int:
        return len(self._by_id)

    def total_value(self) -> float:
        return sum(a.value for a in self._by_id.values())
