"""sishi-zichan 根包。"""

__version__ = "0.1.0"


def health() -> dict[str, str]:
    """供完整性检查使用的简单健康状态。"""
    return {"status": "ok", "version": __version__}
