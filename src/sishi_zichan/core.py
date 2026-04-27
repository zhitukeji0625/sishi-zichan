"""资产标识与校验。"""

import re

# 总长 2–62：首字符 + 1–61 个后续字符
_ASSET_CODE_PATTERN = re.compile(r"^[A-Z0-9][A-Z0-9_-]{1,61}$")


def normalize_asset_name(name: str) -> str:
    """去除首尾空白并折叠连续空白为单个空格。"""
    if not isinstance(name, str):
        raise TypeError("name 必须为 str")
    collapsed = " ".join(name.split())
    return collapsed


def validate_asset_code(code: str) -> bool:
    """校验资产编码：2–62 位，字母数字、下划线、连字符，首字符为字母或数字。"""
    if not isinstance(code, str) or not code:
        return False
    return bool(_ASSET_CODE_PATTERN.match(code))
