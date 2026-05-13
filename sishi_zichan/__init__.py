"""sishi-zichan: 资产登记与查询。"""

from sishi_zichan.assets import (
    Asset,
    create_asset,
    delete_asset,
    get_asset,
    list_assets,
)

__all__ = [
    "Asset",
    "create_asset",
    "delete_asset",
    "get_asset",
    "list_assets",
]
