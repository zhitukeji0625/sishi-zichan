"""sishi-zichan — minimal package bootstrap."""

__version__ = "0.1.0"


def normalize_name(name: str) -> str:
    """Return stripped, non-empty string or raise ValueError."""
    cleaned = name.strip()
    if not cleaned:
        raise ValueError("name must not be empty")
    return cleaned
