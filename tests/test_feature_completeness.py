"""
功能完整性：模块必须同时满足以下能力，否则 CI 失败。
"""

import pytest

from sishi_zichan import AssetRegistry, AssetError, __version__


def test_package_exports_version() -> None:
    assert __version__
    assert isinstance(__version__, str)


def test_registry_create_get_list_delete() -> None:
    reg = AssetRegistry()
    assert reg.count() == 0

    a = reg.create("  现金  ", 100.0)
    assert a.id.startswith("a-")
    assert a.name == "现金"
    assert a.value == 100.0

    same = reg.get(a.id)
    assert same == a

    items = reg.list_all()
    assert len(items) == 1
    assert items[0].id == a.id

    reg.delete(a.id)
    assert reg.count() == 0
    with pytest.raises(AssetError):
        reg.get(a.id)


def test_validation_empty_name() -> None:
    reg = AssetRegistry()
    with pytest.raises(AssetError, match="名称"):
        reg.create("", 1)
    with pytest.raises(AssetError, match="名称"):
        reg.create("   ", 1)


def test_validation_negative_value() -> None:
    reg = AssetRegistry()
    with pytest.raises(AssetError, match="负"):
        reg.create("x", -0.01)


def test_delete_missing_raises() -> None:
    reg = AssetRegistry()
    with pytest.raises(AssetError, match="不存在"):
        reg.delete("a-999")


def test_iter_ids_matches_list() -> None:
    reg = AssetRegistry()
    reg.create("A", 1)
    reg.create("B", 2)
    ids = set(reg.iter_ids())
    assert ids == {a.id for a in reg.list_all()}
