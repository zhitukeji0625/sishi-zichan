"""Feature completeness: public API and behaviors required by the product."""

import inspect

import pytest

import sishi_zichan
from sishi_zichan import Asset, AssetNotFoundError, AssetRegistry


def test_public_exports_match_documented_api() -> None:
    expected = {"Asset", "AssetNotFoundError", "AssetRegistry", "__version__"}
    assert set(sishi_zichan.__all__) == expected
    for name in expected:
        assert hasattr(sishi_zichan, name)


def test_asset_registry_crud_and_list() -> None:
    reg = AssetRegistry()
    a = Asset(id="a1", name="First", kind="doc")
    reg.add(a)
    assert len(reg) == 1
    assert reg.get("a1") == a
    assert reg.list_all() == [a]
    reg.remove("a1")
    assert len(reg) == 0
    with pytest.raises(AssetNotFoundError):
        reg.get("a1")


def test_duplicate_add_rejected() -> None:
    reg = AssetRegistry()
    reg.add(Asset(id="x", name="one"))
    with pytest.raises(ValueError, match="duplicate"):
        reg.add(Asset(id="x", name="two"))


def test_empty_id_rejected() -> None:
    reg = AssetRegistry()
    with pytest.raises(ValueError, match="non-empty"):
        reg.add(Asset(id="", name="bad"))
    with pytest.raises(ValueError, match="non-empty"):
        reg.add(Asset(id="   ", name="bad"))


def test_upsert_replaces() -> None:
    reg = AssetRegistry()
    reg.upsert(Asset(id="u", name="v1"))
    reg.upsert(Asset(id="u", name="v2", kind="img"))
    assert reg.get("u").name == "v2"
    assert reg.get("u").kind == "img"


def test_iter_ids_and_clear() -> None:
    reg = AssetRegistry()
    reg.add(Asset(id="1", name="a"))
    reg.add(Asset(id="2", name="b"))
    assert set(reg.iter_ids()) == {"1", "2"}
    reg.clear()
    assert len(reg) == 0


def test_asset_is_frozen_dataclass() -> None:
    a = Asset(id="1", name="n")
    with pytest.raises(Exception):  # FrozenInstanceError on supported Python
        a.id = "2"  # type: ignore[misc]


def test_slots_on_asset() -> None:
    assert hasattr(Asset, "__slots__")


def test_registry_methods_are_public_surface() -> None:
    reg = AssetRegistry()
    for name in ("add", "get", "remove", "list_all", "iter_ids", "upsert", "clear"):
        assert callable(getattr(reg, name))
    sig = inspect.signature(AssetRegistry.add)
    params = list(sig.parameters)
    assert params[0] == "self"
    assert params[1] == "asset"


def test_package_version_exposed_for_integrations() -> None:
    assert isinstance(sishi_zichan.__version__, str)
    assert sishi_zichan.__version__
