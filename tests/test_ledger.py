import pytest

from sishi_zichan import AssetLedger, Season, ledger_from_records
from sishi_zichan.ledger import merge_ledgers


def test_add_and_totals():
    lg = AssetLedger()
    lg.add(Season.SPRING, "现金", 100.0)
    lg.add(Season.SPRING, "现金", 50.0)
    lg.add(Season.SUMMER, "理财", 200.0)
    assert lg.for_season(Season.SPRING) == {"现金": 150.0}
    assert lg.total_for_season(Season.SPRING) == 150.0
    assert lg.total_for_season(Season.AUTUMN) == 0.0
    assert lg.grand_total() == 350.0


def test_ledger_from_records():
    lg = ledger_from_records(
        [
            (Season.WINTER, "存款", 10.0),
            (Season.WINTER, "存款", 5.0),
        ]
    )
    assert lg.total_for_season(Season.WINTER) == 15.0


def test_negative_amount_rejected():
    lg = AssetLedger()
    with pytest.raises(ValueError, match="金额"):
        lg.add(Season.AUTUMN, "x", -1.0)


def test_merge_ledgers():
    a = ledger_from_records([(Season.SPRING, "A", 1.0)])
    b = ledger_from_records([(Season.SPRING, "A", 2.0), (Season.SUMMER, "B", 3.0)])
    m = merge_ledgers(a, b)
    assert m.for_season(Season.SPRING)["A"] == pytest.approx(3.0)
    assert m.grand_total() == pytest.approx(6.0)


def test_merge_with_weights():
    a = ledger_from_records([(Season.AUTUMN, "x", 10.0)])
    b = ledger_from_records([(Season.AUTUMN, "x", 10.0)])
    m = merge_ledgers(a, b, weights=[0.5, 2.0])
    assert m.for_season(Season.AUTUMN)["x"] == pytest.approx(25.0)


def test_merge_empty():
    assert merge_ledgers().grand_total() == 0.0


def test_merge_negative_weight():
    a = AssetLedger()
    with pytest.raises(ValueError, match="权重"):
        merge_ledgers(a, weights=[-1.0])
