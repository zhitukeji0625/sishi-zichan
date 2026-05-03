from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class Asset:
    name: str
    value: float
    meta: dict[str, Any] = field(default_factory=dict)


class AssetStore:
    """线程不安全的内存资产表，用于演示与单元测试。"""

    def __init__(self) -> None:
        self._items: list[Asset] = []

    def add(self, name: str, value: float, **meta: Any) -> Asset:
        if not name or not str(name).strip():
            raise ValueError("资产名称不能为空")
        if value < 0:
            raise ValueError("资产价值不能为负数")
        asset = Asset(name=str(name).strip(), value=float(value), meta=dict(meta))
        self._items.append(asset)
        return asset

    def list_all(self) -> list[Asset]:
        return list(self._items)

    def total_value(self) -> float:
        return sum(a.value for a in self._items)
