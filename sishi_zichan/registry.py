from __future__ import annotations

from decimal import Decimal
from typing import Dict, Iterator, List, Optional

from sishi_zichan.models import Asset


class AssetRegistry:
    """内存中的资产登记簿：增删查与合计。"""

    def __init__(self) -> None:
        self._assets: Dict[str, Asset] = {}

    def add(self, asset: Asset) -> None:
        if asset.id in self._assets:
            raise ValueError(f"资产 id 已存在: {asset.id}")
        self._assets[asset.id] = asset

    def get(self, asset_id: str) -> Optional[Asset]:
        return self._assets.get(asset_id)

    def remove(self, asset_id: str) -> bool:
        return self._assets.pop(asset_id, None) is not None

    def list(self) -> List[Asset]:
        return list(self._assets.values())

    def __iter__(self) -> Iterator[Asset]:
        return iter(self.list())

    def total_value(self) -> Decimal:
        if not self._assets:
            return Decimal("0")
        return sum((a.value for a in self._assets.values()), start=Decimal("0"))
