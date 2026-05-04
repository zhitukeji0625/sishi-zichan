"""sishi-zichan 包入口。"""


def version() -> str:
    """返回当前包版本号（与 pyproject.toml 中 project.version 保持一致）。"""
    return "0.1.0"


def is_ready() -> bool:
    """用于健康检查：包已正确加载即视为就绪。"""
    return True
