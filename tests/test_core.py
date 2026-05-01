import pytest

from sishi_zichan.core import greet, project_name


def test_project_name():
    assert project_name() == "sishi-zichan"


@pytest.mark.parametrize(
    ("name", "expected"),
    [
        ("Ada", "Hello, Ada!"),
        ("  Bob  ", "Hello, Bob!"),
        ("", "Hello!"),
        ("   ", "Hello!"),
    ],
)
def test_greet(name, expected):
    assert greet(name) == expected
