"""功能完整性：核心 API 可导入且行为稳定。"""

import pytest

from sishi_zichan import normalize_label, version


def test_version_is_defined():
    assert version() == "0.1.0"


def test_normalize_label_trims_and_preserves_content():
    assert normalize_label("  foo  ") == "foo"


def test_normalize_label_rejects_empty():
    with pytest.raises(ValueError, match="empty"):
        normalize_label("   ")


def test_normalize_label_rejects_none():
    with pytest.raises(TypeError):
        normalize_label(None)  # type: ignore[arg-type]
