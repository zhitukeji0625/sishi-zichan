"""sishi-zichan 核心 API。"""


def health() -> dict[str, str]:
    """返回服务健康状态，供监控与集成测试使用。"""
    return {"status": "ok", "service": "sishi-zichan"}
