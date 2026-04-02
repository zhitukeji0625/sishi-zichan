"""应用健康与基础校验。"""


def health_status() -> dict[str, str]:
    """返回固定健康状态，供监控与集成测试使用。"""
    return {"status": "ok"}
