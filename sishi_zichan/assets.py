"""资产相关的基础校验与规范化。"""


def normalize_asset_name(name: str) -> str:
    """去除首尾空白；空名称视为无效并抛出 ValueError。"""
    if name is None:
        raise ValueError("资产名称不能为空")
    stripped = name.strip()
    if not stripped:
        raise ValueError("资产名称不能为空")
    return stripped
