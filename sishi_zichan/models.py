from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal


@dataclass(frozen=True)
class Asset:
    """单条资产记录。"""

    id: str
    name: str
    value: Decimal

    def __post_init__(self) -> None:
        if not self.id or not self.id.strip():
            raise ValueError("资产 id 不能为空")
        if not self.name or not self.name.strip():
            raise ValueError("资产名称不能为空")
        if self.value < 0:
            raise ValueError("资产金额不能为负")
