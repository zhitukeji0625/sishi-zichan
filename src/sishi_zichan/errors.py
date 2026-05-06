"""领域异常。"""


class AssetNotFoundError(KeyError):
    """请求的资产 ID 不存在。"""


class AssetExistsError(ValueError):
    """同一 ID 的资产已存在。"""
