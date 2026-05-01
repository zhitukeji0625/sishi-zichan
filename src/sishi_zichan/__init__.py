"""sishi-zichan: lightweight in-memory asset registry."""

from sishi_zichan.registry import Asset, AssetNotFoundError, AssetRegistry

__version__ = "0.1.0"

__all__ = [
    "Asset",
    "AssetRegistry",
    "AssetNotFoundError",
    "__version__",
]
