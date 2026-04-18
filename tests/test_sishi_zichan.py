from pathlib import Path

import pytest

from sishi_zichan import get_project_title, get_version


def test_get_version():
    assert get_version() == "0.1.0"


def test_get_project_title_from_default_readme():
    assert get_project_title() == "sishi-zichan"


def test_get_project_title_strips_markdown_heading():
    readme = Path(__file__).resolve().parent.parent / "README.md"
    assert get_project_title(readme) == "sishi-zichan"


def test_get_project_title_empty_file(tmp_path: Path):
    p = tmp_path / "README.md"
    p.write_text("\n\n  \n", encoding="utf-8")
    with pytest.raises(ValueError, match="no non-empty"):
        get_project_title(p)
