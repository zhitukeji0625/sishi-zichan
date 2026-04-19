import sishi_zichan


def test_project_name():
    assert sishi_zichan.project_name() == "sishi-zichan"


def test_project_summary_matches_readme():
    assert sishi_zichan.project_summary() == "sishi-zichan"
