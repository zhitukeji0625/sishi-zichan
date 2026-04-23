"""sishi-zichan 根包：提供可被测试验证的最小公开 API。"""

__all__ = ["project_info", "health_check"]


def project_info() -> dict[str, str]:
    """返回项目元数据，供集成测试与运维探活使用。"""
    return {"name": "sishi-zichan", "version": "0.1.0"}


def health_check() -> dict[str, str]:
    """简单健康检查负载。"""
    return {"status": "ok"}
