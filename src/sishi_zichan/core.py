"""核心数值与资产汇总逻辑。"""

from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation
from typing import Iterable


_AMOUNT_RE = re.compile(
    r"^\s*(?P<sign>-?)\s*(?P<num>\d+(?:\.\d+)?)\s*$",
    re.UNICODE,
)


def parse_amount(value: str) -> Decimal:
    """将纯数字字符串解析为 Decimal，支持可选负号与空白。"""
    if not isinstance(value, str):
        raise TypeError("value 必须是 str")
    m = _AMOUNT_RE.match(value)
    if not m:
        raise ValueError("无法解析的金额字符串")
    raw = m.group("sign") + m.group("num")
    try:
        return Decimal(raw)
    except InvalidOperation as e:
        raise ValueError("金额超出可表示范围") from e


def sum_assets(amounts: Iterable[Decimal | str]) -> Decimal:
    """对若干金额求和；字符串会先经 parse_amount 解析。"""
    total = Decimal("0")
    for item in amounts:
        if isinstance(item, Decimal):
            total += item
        elif isinstance(item, str):
            total += parse_amount(item)
        else:
            raise TypeError("金额元素必须是 Decimal 或 str")
    return total
