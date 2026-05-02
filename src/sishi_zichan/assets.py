from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Asset:
    """单项资产：名称与非负金额。"""

    name: str
    value: float

    def __post_init__(self) -> None:
        if not self.name or not str(self.name).strip():
            raise ValueError("资产名称不能为空")
        if self.value < 0:
            raise ValueError("资产金额不能为负数")


def total_value(assets: list[Asset]) -> float:
    """返回资产列表的金额合计。"""
    return float(sum(a.value for a in assets))
