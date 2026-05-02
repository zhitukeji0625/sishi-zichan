"""Core helpers used across the package."""

from __future__ import annotations


def normalize_name(name: str) -> str:
    """Return a trimmed, non-empty display name or raise ValueError."""
    if not isinstance(name, str):
        raise TypeError("name must be a string")
    cleaned = name.strip()
    if not cleaned:
        raise ValueError("name must not be empty")
    return cleaned


def project_title() -> str:
    """Human-readable project title for UI or logs."""
    return "sishi-zichan"
