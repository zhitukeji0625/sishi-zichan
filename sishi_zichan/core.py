"""核心业务占位实现，供完整性测试覆盖。"""


def health() -> dict[str, str]:
    """返回服务健康状态，供集成探测使用。"""
    return {"status": "ok"}


def add(a: int, b: int) -> int:
    """整数加法。"""
    return a + b
