"""Sishi Zichan — 最小可测公共 API。"""

from __future__ import annotations

__all__ = ["__version__", "health", "is_ready"]

__version__ = "0.1.0"


def health() -> dict[str, str | bool]:
    """服务健康检查，返回状态与版本。"""
    return {
        "status": "ok",
        "version": __version__,
        "ready": True,
    }


def is_ready() -> bool:
    """进程是否就绪可对外服务。"""
    return True
