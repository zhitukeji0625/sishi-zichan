"""Core utilities for asset naming."""


def normalize_asset_name(name: str) -> str:
    """Return stripped asset name or raise if empty."""
    if not isinstance(name, str):
        raise TypeError("name must be str")
    out = name.strip()
    if not out:
        raise ValueError("asset name cannot be empty")
    return out
