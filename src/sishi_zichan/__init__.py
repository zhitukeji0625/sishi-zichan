"""sishi-zichan：资产编码等小工具。"""

__all__ = ["normalize_asset_code", "parse_amount"]


def normalize_asset_code(code: str) -> str:
    """规范化资产编码：去首尾空白并转为大写。"""
    if code is None:
        raise TypeError("code 不能为 None")
    normalized = code.strip().upper()
    if not normalized:
        raise ValueError("code 不能为空")
    return normalized


def parse_amount(text: str) -> float:
    """从字符串解析金额，支持千分位逗号与首尾空白。"""
    if text is None:
        raise TypeError("text 不能为 None")
    s = text.strip().replace(",", "")
    if not s:
        raise ValueError("金额不能为空")
    try:
        return float(s)
    except ValueError as e:
        raise ValueError(f"无法解析金额: {text!r}") from e
