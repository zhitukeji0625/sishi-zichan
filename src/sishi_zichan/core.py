"""Core helpers for asset identifiers."""

import re

_ASSET_CODE_PATTERN = re.compile(r"^[A-Za-z0-9_-]{4,64}$")


def validate_asset_code(code: str) -> bool:
    """Return True if ``code`` is a non-empty asset identifier (4–64 allowed chars)."""
    if not isinstance(code, str):
        return False
    stripped = code.strip()
    if not stripped:
        return False
    return bool(_ASSET_CODE_PATTERN.fullmatch(stripped))


def normalize_asset_code(code: str) -> str:
    """Strip whitespace; raise ValueError if result is not a valid asset code."""
    if not isinstance(code, str):
        raise TypeError("code must be str")
    normalized = code.strip()
    if not validate_asset_code(normalized):
        raise ValueError("invalid asset code")
    return normalized
