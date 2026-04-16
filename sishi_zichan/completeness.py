"""资产记录字段完整性校验。"""

from __future__ import annotations

from typing import Any, Mapping

REQUIRED_FIELDS: tuple[str, ...] = ("id", "name", "value")


def _is_blank(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, str) and value.strip() == "":
        return True
    return False


def validate_asset_record(data: Mapping[str, Any]) -> None:
    """
    校验资产记录是否包含必填字段且非空。

    :param data: 待校验的记录
    :raises TypeError: data 不是映射类型
    :raises ValueError: 缺少必填字段或字段值为空
    """
    if not isinstance(data, Mapping):
        raise TypeError("记录必须是映射类型（例如 dict）")

    missing = [key for key in REQUIRED_FIELDS if key not in data or _is_blank(data[key])]
    if missing:
        raise ValueError(f"记录不完整，缺少或为空: {', '.join(missing)}")
