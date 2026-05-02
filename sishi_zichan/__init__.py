"""sishi-zichan: small asset registry API."""

from sishi_zichan.assets import Asset, create_asset, list_assets, total_value

__all__ = ["Asset", "create_asset", "list_assets", "total_value"]
