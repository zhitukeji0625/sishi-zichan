from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Iterable


@dataclass(frozen=True, slots=True)
class Asset:
    """A single line item with a monetary value."""

    name: str
    value: Decimal | int | float
    currency: str = "CNY"

    def normalized_value(self) -> Decimal:
        if isinstance(self.value, Decimal):
            return self.value
        return Decimal(str(self.value))


class Portfolio:
    """Collection of assets; supports total value and filtering by currency."""

    def __init__(self, assets: Iterable[Asset] | None = None) -> None:
        self._assets: list[Asset] = list(assets or [])

    def add(self, asset: Asset) -> None:
        self._assets.append(asset)

    def total_value(self, currency: str | None = None) -> Decimal:
        total = Decimal("0")
        for a in self._assets:
            if currency is not None and a.currency != currency:
                continue
            total += a.normalized_value()
        return total

    def __len__(self) -> int:
        return len(self._assets)
