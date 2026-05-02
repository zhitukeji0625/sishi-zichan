import pytest

from sishi_zichan import Asset, total_value


def test_total_value_empty() -> None:
    assert total_value([]) == 0.0


def test_total_value_single() -> None:
    assert total_value([Asset("现金", 100.0)]) == 100.0


def test_total_value_multiple() -> None:
    assets = [
        Asset("现金", 100.0),
        Asset("存款", 250.5),
    ]
    assert total_value(assets) == 350.5


def test_asset_rejects_negative_value() -> None:
    with pytest.raises(ValueError, match="不能为负数"):
        Asset("无效", -1.0)


def test_asset_rejects_blank_name() -> None:
    with pytest.raises(ValueError, match="名称不能为空"):
        Asset("", 0.0)

    with pytest.raises(ValueError, match="名称不能为空"):
        Asset("   ", 0.0)


def test_asset_allows_zero_value() -> None:
    a = Asset("零余额", 0.0)
    assert a.value == 0.0
