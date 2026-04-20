"""Smoke tests for repository layout and documented basics."""

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]


def test_readme_exists_and_has_title():
    readme = REPO_ROOT / "README.md"
    assert readme.is_file(), "README.md must exist at repository root"
    text = readme.read_text(encoding="utf-8")
    assert "# sishi-zichan" in text, "README must document the project name"


def test_no_accidental_nested_git_metadata_in_tree():
    """Guard against committing a nested .git directory as regular files."""
    nested_git = REPO_ROOT / ".git" / ".git"
    assert not nested_git.exists()
