from __future__ import annotations

from typing import Any


REQUIRED_STRING_FIELDS = ("id", "name", "category")


def validate_asset_record(record: Any) -> list[str]:
    """
    校验资产记录是否满足发布/入库所需字段。

    返回缺失或无效的字段名列表；空列表表示记录完整。
    """
    errors: list[str] = []

    if not isinstance(record, dict):
        return ["<root>"]

    for key in REQUIRED_STRING_FIELDS:
        value = record.get(key)
        if value is None:
            errors.append(key)
            continue
        if not isinstance(value, str):
            errors.append(key)
            continue
        if not value.strip():
            errors.append(key)

    return errors
