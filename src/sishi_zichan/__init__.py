"""sishi-zichan 公共 API。"""

from sishi_zichan.core import health_check

__all__ = ["__version__", "health_check"]
__version__ = "0.1.0"


def get_version() -> str:
    """返回当前包版本号。"""
    return __version__
