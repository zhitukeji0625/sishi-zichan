"""sishi-zichan: 简单资产登记与汇总（占位实现，供自动化完整性校验）。"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Iterator, List


@dataclass
class AssetRegistry:
    """按名称维护资产条目，同名则覆盖。"""

    _items: Dict[str, float] = field(default_factory=dict)

    def add(self, name: str, value: float) -> None:
        if not isinstance(name, str) or not name.strip():
            raise ValueError("name must be a non-empty string")
        if not isinstance(value, (int, float)):
            raise TypeError("value must be a number")
        if value < 0:
            raise ValueError("value must be non-negative")
        self._items[name.strip()] = float(value)

    def get(self, name: str) -> float:
        key = name.strip()
        if key not in self._items:
            raise KeyError(key)
        return self._items[key]

    def total(self) -> float:
        return sum(self._items.values())

    def names(self) -> List[str]:
        return sorted(self._items.keys())

    def __iter__(self) -> Iterator[tuple[str, float]]:
        for k in sorted(self._items):
            yield k, self._items[k]
