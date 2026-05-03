"""核心计算逻辑。"""


def net_worth(assets: list[float], liabilities: list[float]) -> float:
    """
    计算净资产：资产合计减去负债合计。

    参数可为空列表，视为 0。
    """
    return float(sum(assets) - sum(liabilities))
