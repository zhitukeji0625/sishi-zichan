from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterator
from uuid import uuid4


class AssetNotFoundError(LookupError):
    """指定 id 的资产不存在。"""


@dataclass
class Asset:
    """单条资产记录。"""

    id: str
    name: str
    value_cents: int = 0
    tags: list[str] = field(default_factory=list)


class AssetStore:
    """进程内资产存储，用于登记与查询。"""

    def __init__(self) -> None:
        self._by_id: dict[str, Asset] = {}

    def create(self, name: str, value_cents: int = 0, tags: list[str] | None = None) -> Asset:
        if not name or not str(name).strip():
            raise ValueError("name 不能为空")
        if value_cents < 0:
            raise ValueError("value_cents 不能为负")
        aid = str(uuid4())
        asset = Asset(id=aid, name=name.strip(), value_cents=value_cents, tags=list(tags or []))
        self._by_id[aid] = asset
        return asset

    def get(self, asset_id: str) -> Asset:
        try:
            return self._by_id[asset_id]
        except KeyError as exc:
            raise AssetNotFoundError(asset_id) from exc

    def list(self) -> list[Asset]:
        return list(self._by_id.values())

    def iter_ids(self) -> Iterator[str]:
        return iter(self._by_id)

    def update(
        self,
        asset_id: str,
        *,
        name: str | None = None,
        value_cents: int | None = None,
        tags: list[str] | None = None,
    ) -> Asset:
        asset = self.get(asset_id)
        if name is not None:
            if not str(name).strip():
                raise ValueError("name 不能为空")
            asset.name = name.strip()
        if value_cents is not None:
            if value_cents < 0:
                raise ValueError("value_cents 不能为负")
            asset.value_cents = value_cents
        if tags is not None:
            asset.tags = list(tags)
        return asset

    def delete(self, asset_id: str) -> None:
        if asset_id not in self._by_id:
            raise AssetNotFoundError(asset_id)
        del self._by_id[asset_id]

    def count(self) -> int:
        return len(self._by_id)
