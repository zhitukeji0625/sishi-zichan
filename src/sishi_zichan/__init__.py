"""sishi-zichan 核心包。"""


def normalize_asset_id(raw: str) -> str:
    """
    将资产标识规范为去首尾空白、小写形式。

    空字符串或仅空白视为无效，抛出 ValueError。
    """
    if raw is None:
        raise TypeError("资产标识不能为 None")
    s = raw.strip().lower()
    if not s:
        raise ValueError("资产标识不能为空")
    return s


def summarize_holdings(count: int, total_value: float) -> str:
    """生成持仓摘要文案。"""
    if count < 0:
        raise ValueError("持仓数量不能为负")
    if total_value < 0:
        raise ValueError("总价值不能为负")
    return f"共 {count} 项持仓，合计 {total_value:.2f}"
