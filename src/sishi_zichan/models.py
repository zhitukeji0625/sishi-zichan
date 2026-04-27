from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal


@dataclass(frozen=True, slots=True)
class Asset:
    """单条资产记录。"""

    name: str
    amount: Decimal
    currency: str = "CNY"

    def __post_init__(self) -> None:
        if not self.name or not self.name.strip():
            raise ValueError("资产名称不能为空")
        if self.amount < 0:
            raise ValueError("金额不能为负数")
        if not self.currency or not self.currency.strip():
            raise ValueError("币种不能为空")
