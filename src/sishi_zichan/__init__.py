"""sishi-zichan: 资产相关项目占位包，后续可在此扩展业务逻辑。"""

__version__ = "0.1.0"


def health() -> dict[str, str]:
    """返回包健康状态，供集成测试与探活使用。"""
    return {"status": "ok", "package": "sishi-zichan", "version": __version__}
