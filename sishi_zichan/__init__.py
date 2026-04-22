"""Sishi asset (zichan) helpers — public API surface for integration tests."""

from sishi_zichan.inventory import (
    clear_inventory,
    list_assets,
    register_asset,
    total_value,
)

__all__ = [
    "clear_inventory",
    "list_assets",
    "register_asset",
    "total_value",
]
