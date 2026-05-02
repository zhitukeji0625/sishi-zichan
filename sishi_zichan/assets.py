from __future__ import annotations

from dataclasses import dataclass, field
from typing import List

_REGISTRY: List["Asset"] = []


@dataclass
class Asset:
    """A named monetary asset."""

    name: str
    value: float

    def __post_init__(self) -> None:
        if not (self.name or "").strip():
            raise ValueError("name must be non-empty")


def create_asset(name: str, value: float) -> Asset:
    """Register a new asset and return it."""
    if value < 0:
        raise ValueError("value must be non-negative")
    asset = Asset(name=name.strip(), value=float(value))
    _REGISTRY.append(asset)
    return asset


def list_assets() -> List[Asset]:
    """Return a shallow copy of registered assets (newest last)."""
    return list(_REGISTRY)


def total_value() -> float:
    """Sum of all registered asset values."""
    return sum(a.value for a in _REGISTRY)


def reset_registry() -> None:
    """Clear in-memory registry (for tests only)."""
    _REGISTRY.clear()
