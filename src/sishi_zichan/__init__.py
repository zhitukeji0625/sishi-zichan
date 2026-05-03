"""sishi-zichan 公共 API。"""

__version__ = "0.1.0"


def health() -> dict[str, str]:
    """返回用于健康检查的固定负载。"""
    return {"status": "ok", "service": "sishi-zichan"}
