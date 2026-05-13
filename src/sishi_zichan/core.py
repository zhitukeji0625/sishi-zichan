def normalize_name(value: str) -> str:
    """Return stripped, non-empty name or raise ValueError."""
    if not isinstance(value, str):
        raise TypeError("value must be str")
    cleaned = value.strip()
    if not cleaned:
        raise ValueError("name must not be empty")
    return cleaned
