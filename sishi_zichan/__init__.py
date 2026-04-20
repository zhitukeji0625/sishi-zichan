"""sishi-zichan 核心占位实现，供自动化与健康检查使用。"""

__all__ = ["version", "ping"]


def version() -> str:
    """返回包版本字符串。"""
    return "0.1.0"


def ping() -> str:
    """简单存活探测，固定返回 ok。"""
    return "ok"
