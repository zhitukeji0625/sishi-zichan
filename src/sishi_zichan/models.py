"""数据模型。"""

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Asset:
    """登记的一条资产记录。"""

    asset_id: str
    name: str
    value: float
