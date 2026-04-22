"""In-memory asset inventory used for feature-completeness checks."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterator

_assets: list["_AssetRow"] = []


@dataclass(frozen=True)
class _AssetRow:
    name: str
    value: float


def clear_inventory() -> None:
    """Remove all registered assets (test isolation)."""
    _assets.clear()


def register_asset(name: str, value: float) -> None:
    """Register an asset with a non-negative monetary value."""
    if not name or not str(name).strip():
        raise ValueError("asset name must be non-empty")
    if value < 0:
        raise ValueError("asset value must be non-negative")
    _assets.append(_AssetRow(name=str(name).strip(), value=float(value)))


def list_assets() -> list[tuple[str, float]]:
    """Return a snapshot of (name, value) pairs in registration order."""
    return [(row.name, row.value) for row in _assets]


def total_value() -> float:
    """Sum of all registered asset values."""
    return sum(row.value for row in _assets)


def iter_asset_names() -> Iterator[str]:
    """Yield asset names in registration order."""
    for row in _assets:
        yield row.name
