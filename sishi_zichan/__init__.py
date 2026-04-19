"""sishi-zichan：内存资产登记与查询。"""

from sishi_zichan.store import Asset, AssetStore, AssetNotFoundError

__all__ = ["Asset", "AssetStore", "AssetNotFoundError", "__version__"]

__version__ = "0.1.0"
