"""功能完整性：对外符号可导入、可调用，且与 __all__ 一致。"""

import inspect

import pytest

import sishi_zichan


def test_public_api_matches_all() -> None:
    declared = set(sishi_zichan.__all__)
    for name in declared:
        assert hasattr(sishi_zichan, name), f"__all__ 含 {name} 但模块未导出"
    # 模块顶层不应有未列入 __all__ 的「公共」实现细节（双下划线除外）
    public_names = {n for n in dir(sishi_zichan) if not n.startswith("_")}
    extra = public_names - declared - {"__all__", "__builtins__", "__cached__", "__doc__", "__file__", "__loader__", "__name__", "__package__", "__path__", "__spec__"}
    assert not extra, f"存在未列入 __all__ 的公开名: {extra}"


@pytest.mark.parametrize("name", sishi_zichan.__all__)
def test_each_export_is_callable_or_type(name: str) -> None:
    obj = getattr(sishi_zichan, name)
    assert callable(obj) or inspect.isclass(obj), f"{name} 应为类或可调用"


def test_asset_lifecycle_and_total() -> None:
    a = sishi_zichan.create_asset(" 现金 ", 100.0)
    assert a.id is not None
    assert a.name == "现金"
    b = sishi_zichan.create_asset("债券", 50.5)
    listed = sishi_zichan.list_assets()
    assert len(listed) == 2
    assert sishi_zichan.total_value() == pytest.approx(150.5)
    assert sishi_zichan.total_value((a, b)) == pytest.approx(150.5)


def test_create_asset_rejects_invalid_value() -> None:
    sishi_zichan.create_asset("x", 1)
    with pytest.raises(ValueError):
        sishi_zichan.create_asset("bad", "not-a-number")  # type: ignore[arg-type]
