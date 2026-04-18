"""sishi-zichan: minimal project surface for smoke tests."""

from pathlib import Path


def get_project_title(readme_path: str | Path | None = None) -> str:
    """Return the first non-empty line of README.md (project title)."""
    path = Path(readme_path) if readme_path is not None else Path(__file__).resolve().parent.parent / "README.md"
    text = path.read_text(encoding="utf-8")
    for line in text.splitlines():
        stripped = line.strip()
        if stripped:
            return stripped.lstrip("#").strip()
    raise ValueError("README.md has no non-empty title line")


def get_version() -> str:
    """Package version string (kept in sync with pyproject.toml for tests)."""
    return "0.1.0"
