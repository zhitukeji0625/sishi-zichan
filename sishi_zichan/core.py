"""核心业务逻辑（金额解析等）。"""

from decimal import Decimal, InvalidOperation
import re


def parse_amount(value: str | None) -> Decimal:
    """
    将用户输入的金额字符串解析为 Decimal。
    支持可选的千分位逗号与首尾空白；空字符串视为无效。
    """
    if value is None:
        raise ValueError("金额不能为 None")
    s = str(value).strip()
    if not s:
        raise ValueError("金额不能为空")
    s = s.replace(",", "")
    if not re.fullmatch(r"-?\d+(\.\d+)?", s):
        raise ValueError(f"无效金额格式: {value!r}")
    try:
        return Decimal(s)
    except InvalidOperation as e:
        raise ValueError(f"无法解析金额: {value!r}") from e


def normalize_asset_label(label: str | None) -> str:
    """规范化资产名称（去首尾空白，空则报错）。"""
    if label is None:
        raise ValueError("名称不能为 None")
    out = str(label).strip()
    if not out:
        raise ValueError("名称不能为空")
    return out
