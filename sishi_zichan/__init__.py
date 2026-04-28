"""sishi-zichan 公共 API。"""

__all__ = ["version", "normalize_label"]


def version() -> str:
    """返回当前包版本号（与 pyproject 中 version 语义一致）。"""
    return "0.1.0"


def normalize_label(text: str) -> str:
    """规范化用户输入的标签：去首尾空白，空串视为无效。"""
    if text is None:
        raise TypeError("text must be str, not None")
    stripped = text.strip()
    if not stripped:
        raise ValueError("label must not be empty")
    return stripped
