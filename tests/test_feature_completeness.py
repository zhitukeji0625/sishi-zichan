"""功能完整性：包必须可导入且导出约定 API。"""

import importlib

import pytest


def test_package_importable():
    pkg = importlib.import_module("sishi_zichan")
    assert hasattr(pkg, "__version__")
    assert isinstance(pkg.__version__, str)
    assert pkg.__version__


def test_public_api_surface():
    import sishi_zichan as sz

    assert "health_check" in sz.__all__
    assert "get_version" not in sz.__all__  # 有意仅通过模块属性暴露
    assert callable(sz.health_check)
    assert sz.health_check() == {"status": "ok"}


def test_get_version_matches():
    import sishi_zichan as sz

    assert sz.get_version() == sz.__version__


@pytest.mark.parametrize(
    "name",
    ["__version__", "health_check", "get_version"],
)
def test_expected_attributes(name: str):
    import sishi_zichan as sz

    assert hasattr(sz, name)
