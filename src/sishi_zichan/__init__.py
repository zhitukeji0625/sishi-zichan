"""sishi-zichan 公共包入口。"""

__all__ = ["health_check"]


def health_check() -> dict[str, str]:
    """返回服务健康状态，供功能完整性测试与探活使用。"""
    return {"status": "ok", "service": "sishi-zichan"}
