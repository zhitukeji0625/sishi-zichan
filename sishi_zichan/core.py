"""核心业务逻辑（占位实现，供测试与后续扩展）。"""

import re


def version() -> str:
    """返回当前包版本号（与 pyproject.toml 对齐由测试校验结构）。"""
    return "0.1.0"


_ASSET_CODE_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$")


def normalize_asset_code(raw: str) -> str:
    """规范化资产编码：去首尾空白，转大写，并校验基本格式。"""
    if raw is None:
        raise TypeError("资产编码不能为 None")
    s = str(raw).strip()
    if not s:
        raise ValueError("资产编码不能为空")
    upper = s.upper()
    if not _ASSET_CODE_PATTERN.match(upper):
        raise ValueError("资产编码格式无效")
    return upper
