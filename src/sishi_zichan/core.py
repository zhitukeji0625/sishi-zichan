"""核心业务辅助函数。"""


def summarize_assets(count: int, total_value: float) -> str:
    """返回资产条目数与合计值的简短摘要字符串。"""
    if count < 0:
        raise ValueError("count must be non-negative")
    if total_value < 0:
        raise ValueError("total_value must be non-negative")
    return f"assets={count}, total={total_value:.2f}"
