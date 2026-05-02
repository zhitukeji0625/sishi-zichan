"""Functional completeness: public API exists and behaves as specified."""

from __future__ import annotations

import importlib
import inspect

import pytest

import sishi_zichan
from sishi_zichan import Asset, create_asset, list_assets, total_value
from sishi_zichan.assets import reset_registry


@pytest.fixture(autouse=True)
def _clean_registry():
    reset_registry()
    yield
    reset_registry()


REQUIRED_EXPORTS = ("Asset", "create_asset", "list_assets", "total_value")


def test_package_exports_complete():
    assert set(sishi_zichan.__all__) == set(REQUIRED_EXPORTS)
    for name in REQUIRED_EXPORTS:
        assert hasattr(sishi_zichan, name), f"missing export: {name}"


def test_create_list_total_roundtrip():
    create_asset("cash", 100.0)
    create_asset("bonds", 50.5)
    items = list_assets()
    assert len(items) == 2
    assert items[0].name == "cash"
    assert items[1].name == "bonds"
    assert total_value() == pytest.approx(150.5)


def test_create_asset_strips_name_and_rejects_empty():
    a = create_asset("  gold  ", 1.0)
    assert a.name == "gold"
    with pytest.raises(ValueError, match="name"):
        create_asset("   ", 0)
    with pytest.raises(ValueError, match="name"):
        create_asset("", 0)


def test_create_asset_rejects_negative_value():
    with pytest.raises(ValueError, match="non-negative"):
        create_asset("x", -1)


def test_total_value_empty_registry():
    assert list_assets() == []
    assert total_value() == 0.0


def test_public_functions_have_docstrings():
    for name in ("create_asset", "list_assets", "total_value"):
        fn = getattr(sishi_zichan, name)
        assert inspect.getdoc(fn), f"{name} should have a docstring"


def test_module_reload_idempotent_exports():
    importlib.reload(sishi_zichan)
    assert set(sishi_zichan.__all__) == set(REQUIRED_EXPORTS)
