"""资产编码与展示名相关工具。"""

import re

# 四位大写字母 + 数字的资产内部编码（示例约定）
_ASSET_CODE_PATTERN = re.compile(r"^[A-Z]{4}\d{3}$")


def validate_asset_code(code: str) -> bool:
    """若 ``code`` 符合 ``AAAA000`` 格式则返回 True。"""
    if not isinstance(code, str):
        return False
    return bool(_ASSET_CODE_PATTERN.fullmatch(code.strip()))


def normalize_asset_label(label: str) -> str:
    """去除首尾空白并折叠连续空白为单个空格。"""
    if not isinstance(label, str):
        raise TypeError("label 必须为 str")
    return " ".join(label.split())
