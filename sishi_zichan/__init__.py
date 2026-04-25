"""sishi-zichan: minimal public surface for health and completeness checks."""

__version__ = "0.1.0"


def health() -> dict:
    """Return a stable health payload for integration and smoke tests."""
    return {"ok": True, "name": "sishi-zichan", "version": __version__}


def required_project_files() -> tuple[str, ...]:
    """Paths that must exist at repo root for a complete checkout."""
    return ("README.md", "pyproject.toml")
