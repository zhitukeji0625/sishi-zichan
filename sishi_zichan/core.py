def normalize_label(text: str) -> str:
    """去除首尾空白并折叠连续空白为单个空格。"""
    if text is None:
        raise TypeError("text 不能为 None")
    parts = text.split()
    return " ".join(parts)
