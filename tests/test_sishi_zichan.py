import pathlib

import sishi_zichan


def test_version_defined():
    assert sishi_zichan.__version__
    assert isinstance(sishi_zichan.__version__, str)


def test_health_returns_ok():
    h = sishi_zichan.health()
    assert h["status"] == "ok"
    assert h["version"] == sishi_zichan.__version__


def test_readme_exists_at_repo_root():
    root = pathlib.Path(__file__).resolve().parents[1]
    assert (root / "README.md").is_file()
