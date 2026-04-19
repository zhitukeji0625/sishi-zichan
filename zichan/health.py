"""健康检查等基础能力，供自动化与部署探活使用。"""


def health_check() -> dict[str, str]:
    """返回服务健康状态摘要。"""
    return {"status": "ok"}
