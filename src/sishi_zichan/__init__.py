"""四时资产 — 占位模块，供仓库完整性测试使用。"""

__version__ = "0.1.0"


def health() -> dict[str, str]:
    """返回表示仓库基本可用的状态。"""
    return {"status": "ok", "component": "sishi-zichan"}
