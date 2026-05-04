from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable


@dataclass
class Asset:
    """单项资产。"""

    name: str
    value: float
    id: str | None = None


_store: list[Asset] = []
_id_counter = 0


def _next_id() -> str:
    global _id_counter
    _id_counter += 1
    return f"a{_id_counter}"


def create_asset(name: str, value: float) -> Asset:
    """登记新资产并返回带 id 的实例。"""
    cleaned = name.strip()
    if not cleaned:
        raise ValueError("资产名称不能为空")
    try:
        amount = float(value)
    except (TypeError, ValueError) as e:
        raise ValueError("资产价值须为数字") from e
    aid = _next_id()
    asset = Asset(name=cleaned, value=amount, id=aid)
    _store.append(asset)
    return asset


def list_assets() -> tuple[Asset, ...]:
    """返回当前仓库中全部资产（只读视图）。"""
    return tuple(_store)


def total_value(assets: Iterable[Asset] | None = None) -> float:
    """合计价值；未传参时对当前仓库求和。"""
    items = list(assets) if assets is not None else _store
    return sum(a.value for a in items)
