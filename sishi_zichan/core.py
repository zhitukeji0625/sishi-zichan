"""核心业务占位：资产合计。"""


def total_assets(cash: float, investments: float) -> float:
    """返回现金与投资的合计金额（均为非负）。"""
    if cash < 0 or investments < 0:
        raise ValueError("cash and investments must be non-negative")
    return cash + investments
