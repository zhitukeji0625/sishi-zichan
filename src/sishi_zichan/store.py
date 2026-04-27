from __future__ import annotations

from decimal import Decimal

from sishi_zichan.models import Asset


class AssetStore:
    """内存中的资产列表，支持增删与按币种汇总。"""

    def __init__(self) -> None:
        self._items: list[Asset] = []

    def add(self, asset: Asset) -> None:
        self._items.append(asset)

    def list_all(self) -> tuple[Asset, ...]:
        return tuple(self._items)

    def remove_by_name(self, name: str) -> bool:
        """按名称删除第一条匹配记录；不存在则返回 False。"""
        key = name.strip()
        for i, a in enumerate(self._items):
            if a.name.strip() == key:
                del self._items[i]
                return True
        return False

    def total_by_currency(self, currency: str = "CNY") -> Decimal:
        """同一币种下金额合计。"""
        c = currency.strip()
        return sum((a.amount for a in self._items if a.currency.strip() == c), start=Decimal("0"))
