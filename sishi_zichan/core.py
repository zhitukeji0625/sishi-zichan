"""资产标识等基础校验与规范化。"""


def normalize_asset_id(asset_id: str) -> str:
    """将资产 ID 规范化为去首尾空白、小写字符串。

    空或仅空白字符串视为无效，抛出 ValueError。
    """
    if asset_id is None:
        raise ValueError("asset_id 不能为 None")
    s = str(asset_id).strip()
    if not s:
        raise ValueError("asset_id 不能为空")
    return s.lower()
