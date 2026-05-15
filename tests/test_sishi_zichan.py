import sishi_zichan


def test_project_name():
    assert sishi_zichan.project_name() == "sishi-zichan"


def test_health():
    h = sishi_zichan.health()
    assert h["status"] == "ok"
    assert h["project"] == "sishi-zichan"
