"""sishi-zichan: small asset-related helpers."""

__version__ = "0.1.0"


def normalize_asset_code(raw: str) -> str:
    """Return uppercase alphanumeric asset code, or raise ValueError."""
    if raw is None:
        raise TypeError("raw must be str, not None")
    s = str(raw).strip().upper()
    if not s:
        raise ValueError("asset code cannot be empty")
    if not s.isalnum():
        raise ValueError("asset code must be alphanumeric")
    return s
