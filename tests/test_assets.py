import pytest

from sishi_zichan.assets import AssetId


def test_valid_asset_id():
    a = AssetId("ASSET-42")
    assert a.value == "ASSET-42"


@pytest.mark.parametrize(
    "bad",
    [
        "",
        "asset-1",
        "ASSET-",
        "ASSET-x",
        "PREFIX-1",
    ],
)
def test_invalid_asset_id_raises(bad: str):
    with pytest.raises(ValueError):
        AssetId(bad)
