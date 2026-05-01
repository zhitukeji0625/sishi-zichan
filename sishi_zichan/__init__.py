"""sishi-zichan 核心包。"""

__version__ = "0.1.0"


def health() -> dict[str, str]:
    """返回服务健康状态，供集成测试与探活使用。"""
    return {"status": "ok", "version": __version__}
