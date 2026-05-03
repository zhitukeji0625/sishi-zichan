from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP


def normalize_asset_label(name: str) -> str:
    """去除首尾空白；空字符串视为无效。"""
    if name is None:
        raise TypeError("name 不能为 None")
    stripped = name.strip()
    if not stripped:
        raise ValueError("资产名称不能为空")
    return stripped


def round_money(value: Decimal | float | str, places: int = 2) -> Decimal:
    """按银行家舍入的半入规则将金额量化到指定位小数。"""
    if places < 0:
        raise ValueError("places 不能为负数")
    d = value if isinstance(value, Decimal) else Decimal(str(value))
    quant = Decimal("1").scaleb(-places)  # 10^-places
    return d.quantize(quant, rounding=ROUND_HALF_UP)
