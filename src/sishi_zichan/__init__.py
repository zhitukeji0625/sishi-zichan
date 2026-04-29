"""sishi-zichan: small asset identifier helpers."""

from __future__ import annotations

import re

_ASSET_ID_RE = re.compile(r"^AST-[0-9]{4,8}$")


def normalize_asset_id(value: str) -> str:
    """Return a canonical asset id (uppercase, stripped) or raise ValueError."""
    s = value.strip().upper()
    if not _ASSET_ID_RE.match(s):
        raise ValueError("asset id must match pattern AST- followed by 4-8 digits")
    return s


def is_valid_asset_id(value: str) -> bool:
    """True if *value* is a valid asset id after normalization attempt."""
    try:
        normalize_asset_id(value)
    except ValueError:
        return False
    return True
