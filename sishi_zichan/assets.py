from __future__ import annotations

from typing import Any, Mapping


def total_position_value(positions: list[Mapping[str, Any]]) -> float:
    """
    Sum market value of positions.

    Each position must include numeric keys ``quantity`` and ``unit_price``.
    Missing or non-numeric values raise ValueError.
    """
    total = 0.0
    for i, pos in enumerate(positions):
        try:
            q = pos["quantity"]
            p = pos["unit_price"]
        except KeyError as e:
            raise ValueError(f"position {i}: missing field {e.args[0]}") from e
        if not isinstance(q, (int, float)) or not isinstance(p, (int, float)):
            raise ValueError(f"position {i}: quantity and unit_price must be numbers")
        total += float(q) * float(p)
    return total
