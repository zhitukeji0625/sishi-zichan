"""核心可测行为。"""

from __future__ import annotations

__version__ = "0.1.0"


def version() -> str:
    """返回当前包版本号。"""
    return __version__


def health() -> dict[str, str]:
    """简单健康检查载荷，供集成测试使用。"""
    return {"status": "ok", "version": __version__}
