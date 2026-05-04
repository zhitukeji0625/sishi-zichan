"""功能完整性：版本、资产模型、注册表 CRUD 与校验。"""

import pytest

from sishi_zichan import Asset, AssetRegistry, get_version


def test_version_is_semver_like() -> None:
    v = get_version()
    parts = v.split(".")
    assert len(parts) == 3
    assert all(p.isdigit() for p in parts)


def test_asset_valid() -> None:
    a = Asset("a-1", "现金", 100)
    assert a.asset_id == "a-1"
    assert a.value_cents == 100


@pytest.mark.parametrize(
    "kwargs",
    [
        {"asset_id": "", "name": "x", "value_cents": 0},
        {"asset_id": "   ", "name": "x", "value_cents": 0},
        {"asset_id": "id", "name": "", "value_cents": 0},
        {"asset_id": "id", "name": "  ", "value_cents": 0},
        {"asset_id": "id", "name": "n", "value_cents": -1},
    ],
)
def test_asset_validation_errors(kwargs: dict) -> None:
    with pytest.raises(ValueError):
        Asset(**kwargs)


def test_registry_crud() -> None:
    r = AssetRegistry()
    a = Asset("x", "测试", 0)
    r.add(a)
    assert r.get("x") == a
    assert r.count() == 1

    r.update(Asset("x", "测试2", 50))
    assert r.get("x").name == "测试2"
    assert r.get("x").value_cents == 50

    r.delete("x")
    assert r.count() == 0
    with pytest.raises(KeyError):
        r.get("x")


def test_registry_duplicate_add() -> None:
    r = AssetRegistry()
    r.add(Asset("d", "dup", 0))
    with pytest.raises(KeyError, match="已存在"):
        r.add(Asset("d", "other", 1))


def test_registry_missing_operations() -> None:
    r = AssetRegistry()
    with pytest.raises(KeyError):
        r.get("missing")
    with pytest.raises(KeyError):
        r.update(Asset("missing", "n", 0))
    with pytest.raises(KeyError):
        r.delete("missing")


def test_list_and_sorted_iteration() -> None:
    r = AssetRegistry()
    r.add(Asset("c", "C", 1))
    r.add(Asset("a", "A", 2))
    r.add(Asset("b", "B", 3))
    ids = [a.asset_id for a in r.iter_sorted_by_id()]
    assert ids == ["a", "b", "c"]
    assert len(r.list_all()) == 3
