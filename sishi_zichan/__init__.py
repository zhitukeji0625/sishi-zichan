"""sishi-zichan: 轻量资产登记核心。"""

from sishi_zichan.models import Asset
from sishi_zichan.registry import AssetRegistry

__all__ = ["Asset", "AssetRegistry", "__version__"]
__version__ = "0.1.0"
