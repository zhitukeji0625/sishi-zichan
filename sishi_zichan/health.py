"""健康检查与项目元信息。"""


def project_status() -> dict[str, str | bool]:
    """返回项目就绪状态，供测试与监控使用。"""
    return {
        "ok": True,
        "name": "sishi-zichan",
    }
