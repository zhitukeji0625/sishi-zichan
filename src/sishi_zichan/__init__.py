"""四时资产 — 公共 API 入口。"""

__version__ = "0.1.0"


def health() -> dict[str, str]:
    """供集成测试与探活使用的最小接口。"""
    return {"status": "ok", "version": __version__}
