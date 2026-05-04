import pytest

import sishi_zichan._assets as assets_mod


@pytest.fixture(autouse=True)
def _reset_asset_store() -> None:
    assets_mod._store.clear()
    assets_mod._id_counter = 0
    yield
    assets_mod._store.clear()
    assets_mod._id_counter = 0
