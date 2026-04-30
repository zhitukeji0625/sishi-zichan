"""sishi-zichan 包入口。"""

__version__ = "0.1.0"


def normalize_asset_id(raw: str) -> str:
    """将资产标识规范为去首尾空白的大写形式。"""
    if raw is None:
        raise TypeError("raw 不能为 None")
    s = str(raw).strip()
    if not s:
        raise ValueError("资产标识不能为空")
    return s.upper()
