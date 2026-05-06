"""sishi-zichan 核心 API。"""


def normalize_asset_name(name: str) -> str:
    """返回规范化的资产名称（去首尾空白，空串视为无效）。"""
    if not isinstance(name, str):
        raise TypeError("name 必须为 str")
    stripped = name.strip()
    if not stripped:
        raise ValueError("资产名称不能为空")
    return stripped
