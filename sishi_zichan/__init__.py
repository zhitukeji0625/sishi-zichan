"""四时资产 — 项目占位包，供导入与版本查询。"""

__version__ = "0.1.0"


def health() -> dict[str, str]:
    """返回简单健康状态，供集成测试使用。"""
    return {"status": "ok", "version": __version__}
