"""Core helpers for asset identifiers."""


def normalize_asset_code(code: str) -> str:
    """
    Return a canonical form of an asset code: stripped and uppercased.

    Raises:
        ValueError: if code is empty or only whitespace.
    """
    if code is None:
        raise ValueError("asset code must be non-empty")
    stripped = code.strip()
    if not stripped:
        raise ValueError("asset code must be non-empty")
    return stripped.upper()
