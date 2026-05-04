from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Asset:
    """单项资产。"""

    name: str
    value: float

    def __post_init__(self) -> None:
        if not self.name.strip():
            raise ValueError("资产名称不能为空")
        if self.value < 0:
            raise ValueError("资产金额不能为负数")


@dataclass
class Portfolio:
    """资产组合，支持汇总。"""

    assets: tuple[Asset, ...]

    def total_value(self) -> float:
        return sum(a.value for a in self.assets)

    def asset_count(self) -> int:
        return len(self.assets)
