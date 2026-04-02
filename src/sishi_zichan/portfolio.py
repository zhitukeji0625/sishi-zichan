"""持仓与价格计算总市值。"""


def total_market_value(
    holdings: dict[str, float],
    prices: dict[str, float],
) -> float:
    """
    按 symbol 将持仓数量与单价相乘后求和。
    仅计算在 prices 中有报价的标的；缺失价格视为 0（不计入）。
    """
    total = 0.0
    for symbol, quantity in holdings.items():
        if quantity < 0:
            raise ValueError(f"持仓数量不能为负: {symbol}={quantity}")
        price = prices.get(symbol)
        if price is None:
            continue
        if price < 0:
            raise ValueError(f"价格不能为负: {symbol}={price}")
        total += quantity * price
    return total
