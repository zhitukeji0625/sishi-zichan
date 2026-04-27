from decimal import Decimal

from sishi_zichan.models import Asset
from sishi_zichan.store import AssetStore


def test_add_list_total() -> None:
    s = AssetStore()
    s.add(Asset("A", Decimal("10")))
    s.add(Asset("B", Decimal("20.5")))
    assert len(s.list_all()) == 2
    assert s.total_by_currency("CNY") == Decimal("30.5")


def test_total_multi_currency() -> None:
    s = AssetStore()
    s.add(Asset("cny", Decimal("100")))
    s.add(Asset("usd", Decimal("50"), currency="USD"))
    assert s.total_by_currency("CNY") == Decimal("100")
    assert s.total_by_currency("USD") == Decimal("50")


def test_remove_by_name() -> None:
    s = AssetStore()
    s.add(Asset("  唯一  ", Decimal("1")))
    assert s.remove_by_name("唯一") is True
    assert s.list_all() == ()
    assert s.remove_by_name("不存在") is False
