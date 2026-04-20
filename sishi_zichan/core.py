"""核心计算逻辑。"""


def net_worth(assets: float, liabilities: float) -> float:
    """净资产 = 资产 - 负债。"""
    if assets < 0:
        raise ValueError("资产不能为负数")
    if liabilities < 0:
        raise ValueError("负债不能为负数")
    return assets - liabilities
