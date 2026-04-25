"""Feature completeness: public API and repo layout invariants."""

from pathlib import Path

import pytest

import sishi_zichan as sz


def test_health_shape():
    h = sz.health()
    assert h["ok"] is True
    assert h["name"] == "sishi-zichan"
    assert h["version"] == sz.__version__
    assert isinstance(h["version"], str)


def test_version_matches_package_metadata():
    try:
        import importlib.metadata as im
    except ImportError:  # pragma: no cover
        pytest.skip("importlib.metadata unavailable")

    dist_version = im.version("sishi-zichan")
    assert dist_version == sz.__version__


@pytest.mark.parametrize("rel", sz.required_project_files())
def test_required_files_exist(rel):
    root = Path(__file__).resolve().parents[1]
    assert (root / rel).is_file(), f"missing required file: {rel}"
