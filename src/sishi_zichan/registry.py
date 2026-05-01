from __future__ import annotations

from dataclasses import dataclass
from typing import Iterator


class AssetNotFoundError(KeyError):
    """Raised when an asset id is not present in the registry."""


@dataclass(frozen=True, slots=True)
class Asset:
    """A registered asset with stable identity and optional metadata."""

    id: str
    name: str
    kind: str = "default"


class AssetRegistry:
    """In-memory registry: add, get, list, update metadata, remove."""

    def __init__(self) -> None:
        self._items: dict[str, Asset] = {}

    def __len__(self) -> int:
        return len(self._items)

    def add(self, asset: Asset) -> None:
        if not asset.id or not asset.id.strip():
            raise ValueError("asset id must be non-empty")
        if asset.id in self._items:
            raise ValueError(f"duplicate asset id: {asset.id!r}")
        self._items[asset.id] = asset

    def get(self, asset_id: str) -> Asset:
        try:
            return self._items[asset_id]
        except KeyError as exc:
            raise AssetNotFoundError(asset_id) from exc

    def remove(self, asset_id: str) -> None:
        if asset_id not in self._items:
            raise AssetNotFoundError(asset_id)
        del self._items[asset_id]

    def list_all(self) -> list[Asset]:
        return list(self._items.values())

    def iter_ids(self) -> Iterator[str]:
        yield from self._items

    def upsert(self, asset: Asset) -> None:
        """Insert or replace an asset with the same id."""
        if not asset.id or not asset.id.strip():
            raise ValueError("asset id must be non-empty")
        self._items[asset.id] = asset

    def clear(self) -> None:
        self._items.clear()
