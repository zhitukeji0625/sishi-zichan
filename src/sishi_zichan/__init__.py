"""sishi-zichan 包入口。"""

__all__ = ["project_slug", "version"]


def project_slug() -> str:
    """返回仓库标识，用于环境与文档一致性检查。"""
    return "sishi-zichan"


def version() -> str:
    """与 pyproject.toml 中的版本对齐（由构建时注入时可再扩展）。"""
    return "0.1.0"
