"""sishi-zichan: small utilities for asset identifiers."""

__all__ = ["normalize_asset_code", "version"]


def version() -> str:
    return "0.1.0"


def normalize_asset_code(code: str) -> str:
    """Return uppercase alphanumeric asset code, or raise ValueError if empty/invalid."""
    if not isinstance(code, str):
        raise TypeError("code must be str")
    s = code.strip().upper()
    if not s:
        raise ValueError("asset code must not be empty")
    if not s.isalnum():
        raise ValueError("asset code must be alphanumeric")
    return s
