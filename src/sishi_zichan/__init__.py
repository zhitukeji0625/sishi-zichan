"""sishi-zichan core utilities."""

__version__ = "0.1.0"


def health() -> dict[str, str]:
    """Return a stable health payload for integration checks."""
    return {"status": "ok", "service": "sishi-zichan"}


def normalize_label(name: str) -> str:
    """Normalize a user-visible label: strip and collapse internal whitespace."""
    if not name or not name.strip():
        return ""
    return " ".join(name.split())
