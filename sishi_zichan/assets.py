from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List
from uuid import uuid4


@dataclass(frozen=True)
class Asset:
    """单条资产记录。"""

    id: str
    name: str
    value: float


_registry: Dict[str, Asset] = {}


def create_asset(name: str, value: float) -> Asset:
    if not name or not name.strip():
        raise ValueError("资产名称不能为空")
    if value < 0:
        raise ValueError("资产金额不能为负数")
    aid = str(uuid4())
    asset = Asset(id=aid, name=name.strip(), value=float(value))
    _registry[aid] = asset
    return asset


def get_asset(asset_id: str) -> Asset:
    if asset_id not in _registry:
        raise KeyError(asset_id)
    return _registry[asset_id]


def list_assets() -> List[Asset]:
    return list(_registry.values())


def delete_asset(asset_id: str) -> None:
    if asset_id not in _registry:
        raise KeyError(asset_id)
    del _registry[asset_id]


def reset_registry() -> None:
    """仅用于测试：清空内存登记。"""
    _registry.clear()
