from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Iterable, Sequence


class Season(str, Enum):
    """四时：用于资产分类。"""

    SPRING = "春"
    SUMMER = "夏"
    AUTUMN = "秋"
    WINTER = "冬"


@dataclass
class AssetLedger:
    """按季节维护名称到金额的映射，支持增量与汇总。"""

    _balances: dict[Season, dict[str, float]] = field(
        default_factory=lambda: {s: {} for s in Season}
    )

    def add(self, season: Season, name: str, amount: float) -> None:
        if amount < 0:
            raise ValueError("金额不能为负数")
        bucket = self._balances[season]
        bucket[name] = bucket.get(name, 0.0) + amount

    def total_for_season(self, season: Season) -> float:
        return sum(self._balances[season].values())

    def grand_total(self) -> float:
        return sum(self.total_for_season(s) for s in Season)

    def for_season(self, season: Season) -> dict[str, float]:
        """返回该季节下名称到金额的只读快照（拷贝）。"""
        return dict(self._balances[season])


def ledger_from_records(
    records: Iterable[tuple[Season, str, float]],
) -> AssetLedger:
    """由 (季节, 名称, 金额) 序列构建台账。"""
    ledger = AssetLedger()
    for season, name, amount in records:
        ledger.add(season, name, amount)
    return ledger


def merge_ledgers(
    *ledgers: AssetLedger,
    weights: Sequence[float] | None = None,
) -> AssetLedger:
    """合并多本台账；可选 weights 与 *ledgers 顺序一一对应，对每本账按比例缩放后再相加。"""
    if not ledgers:
        return AssetLedger()
    if weights is None:
        scale = [1.0] * len(ledgers)
    else:
        if len(weights) != len(ledgers):
            raise ValueError("weights 长度必须与台账本数一致")
        scale = [float(w) for w in weights]
    out = AssetLedger()
    for lg, w in zip(ledgers, scale, strict=True):
        if w < 0:
            raise ValueError("权重不能为负数")
        for season in Season:
            for name, amt in lg.for_season(season).items():
                out.add(season, name, amt * w)
    return out
