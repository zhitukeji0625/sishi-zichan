"""资产相关校验。"""


def validate_positive_amount(amount: float) -> None:
    """校验金额必须为正数且为有限数值。"""
    if not isinstance(amount, (int, float)):
        raise TypeError("金额必须为数字类型")
    if isinstance(amount, bool):
        raise TypeError("金额必须为数字类型")
    if amount != amount:  # NaN
        raise ValueError("金额不能为 NaN")
    if amount == float("inf") or amount == float("-inf"):
        raise ValueError("金额不能为无穷大")
    if amount <= 0:
        raise ValueError("金额必须大于 0")


def normalize_asset_code(code: str) -> str:
    """将资产代码规范为大写并去除首尾空白。"""
    if not isinstance(code, str):
        raise TypeError("资产代码必须为字符串")
    s = code.strip().upper()
    if not s:
        raise ValueError("资产代码不能为空")
    return s
