def project_name() -> str:
    """返回项目名称标识（用于集成自检）。"""
    return "sishi-zichan"


def greet(name: str) -> str:
    """返回对给定名称的问候语。name 为空时视为匿名。"""
    if not name or not str(name).strip():
        return "Hello!"
    return f"Hello, {str(name).strip()}!"
