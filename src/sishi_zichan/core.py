"""核心业务占位：后续可接入真实资产逻辑。"""


def health_check() -> dict[str, str]:
    """供运维与完整性测试使用的健康检查。"""
    return {"status": "ok"}
