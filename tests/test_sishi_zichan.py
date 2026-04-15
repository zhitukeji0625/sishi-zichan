import sishi_zichan


def test_project_name():
    assert sishi_zichan.project_name() == "sishi-zichan"


def test_version():
    assert sishi_zichan.version() == "0.1.0"
