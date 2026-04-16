"""sishi-zichan 项目占位包：在业务代码落地前提供可导入的 API 与版本信息。"""

__all__ = ["__version__", "health_check"]

__version__ = "0.1.0"


def health_check() -> dict[str, str]:
    """返回用于冒烟测试的简单状态负载。"""
    return {"status": "ok", "version": __version__}
