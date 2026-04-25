"""包导入与核心 API 完整性测试。"""

import sishi_zichan


def test_version_defined():
    assert hasattr(sishi_zichan, "__version__")
    assert isinstance(sishi_zichan.__version__, str)
    assert sishi_zichan.__version__


def test_health_returns_expected_shape():
    h = sishi_zichan.health()
    assert h["status"] == "ok"
    assert h["package"] == "sishi-zichan"
    assert h["version"] == sishi_zichan.__version__
