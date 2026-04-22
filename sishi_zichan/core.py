"""核心业务逻辑：资产标识规范化与估值汇总。"""


def normalize_asset_id(raw: str) -> str:
    """将资产标识规范为去首尾空白、大写形式。"""
    if raw is None:
        raise TypeError("资产标识不能为 None")
    s = str(raw).strip().upper()
    if not s:
        raise ValueError("资产标识不能为空")
    return s


def calculate_total_value(items: list[tuple[str, float]]) -> float:
    """对 (资产标识, 金额) 列表求和；金额须为非负数。"""
    total = 0.0
    for _asset_id, value in items:
        if value < 0:
            raise ValueError("单项金额不能为负数")
        total += float(value)
    return total
