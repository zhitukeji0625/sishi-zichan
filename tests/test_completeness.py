"""功能完整性冒烟测试：验证包可导入、核心 API 行为稳定。"""

import importlib

import pytest


def test_package_importable():
    mod = importlib.import_module("sishi_zichan")
    assert hasattr(mod, "__version__")
    assert isinstance(mod.__version__, str)


def test_health_payload():
    from sishi_zichan import health

    payload = health()
    assert payload["status"] == "ok"
    assert payload["version"]


@pytest.mark.parametrize("field", ("status", "version"))
def test_health_has_required_fields(field: str):
    from sishi_zichan import health

    assert field in health()
