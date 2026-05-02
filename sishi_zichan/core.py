from __future__ import annotations

import re


def format_currency_cny(fen: int) -> str:
    """Format integer fen (分) as CNY string like '¥12.34'."""
    if not isinstance(fen, int):
        raise TypeError("fen must be int")
    sign = "-" if fen < 0 else ""
    n = abs(fen)
    yuan, remainder = divmod(n, 100)
    return f"{sign}¥{yuan}.{remainder:02d}"


# Minus may appear before ¥ (e.g. "-¥0.99") or before digits without symbol.
_CNY_RE = re.compile(r"^\s*(-?)\s*¥?\s*(\d+)(?:\.(\d{0,2}))?\s*$")


def parse_cny_to_fen(s: str) -> int:
    """Parse strings like '12.34', '¥12.3', '-0.5' to fen (integer)."""
    if not isinstance(s, str):
        raise TypeError("s must be str")
    m = _CNY_RE.match(s.strip())
    if not m:
        raise ValueError(f"invalid CNY amount: {s!r}")
    neg, whole, frac = m.group(1), m.group(2), (m.group(3) or "")
    frac = (frac + "00")[:2]
    fen = int(whole) * 100 + int(frac)
    if neg == "-":
        fen = -fen
    return fen
