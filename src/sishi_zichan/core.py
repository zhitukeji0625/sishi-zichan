from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Asset:
    """单项资产。"""

    name: str
    value: float

    def __post_init__(self) -> None:
        if not isinstance(self.name, str) or not self.name.strip():
            raise ValueError("资产名称必须为非空字符串")
        if not isinstance(self.value, (int, float)):
            raise TypeError("资产金额必须为数值类型")


def validate_asset(asset: Asset) -> None:
    """校验资产金额是否合法（非负且有限）。"""
    if asset.value < 0:
        raise ValueError("资产金额不能为负数")
    if not (asset.value == asset.value):  # NaN
        raise ValueError("资产金额不能为 NaN")
    if abs(asset.value) == float("inf"):
        raise ValueError("资产金额不能为无穷大")


def portfolio_total(assets: list[Asset]) -> float:
    """计算资产列表总金额，并在汇总前逐项校验。"""
    total = 0.0
    for a in assets:
        validate_asset(a)
        total += float(a.value)
    return total
