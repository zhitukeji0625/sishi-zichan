"""sishi-zichan: minimal application surface for smoke tests."""

__version__ = "0.1.0"


def app_status():
    """Return a stable dict used by health-style checks."""
    return {"ok": True, "service": "sishi-zichan", "version": __version__}
