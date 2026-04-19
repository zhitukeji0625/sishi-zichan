from __future__ import annotations


def summarize_quantities(entries: list[tuple[str, int]]) -> dict[str, int]:
    """按规范化后的物料标识合并数量。

    - 标识会去除首尾空白并转为小写，用于合并与去重。
    - 数量必须为非负整数，否则抛出 ``ValueError``。
    """
    out: dict[str, int] = {}
    for raw_id, qty in entries:
        key = raw_id.strip().lower()
        if qty < 0 or not isinstance(qty, int):
            raise ValueError("数量必须为非负整数")
        out[key] = out.get(key, 0) + qty
    return out
