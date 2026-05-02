"""资产标识与校验。"""

from dataclasses import dataclass
import re


@dataclass(frozen=True)
class AssetId:
    """业务资产编号，格式为 ASSET-后跟至少一位数字。"""

    value: str

    _PATTERN = re.compile(r"^ASSET-\d+$")

    def __post_init__(self) -> None:
        if not self._PATTERN.match(self.value):
            raise ValueError(
                "资产编号须匹配 ASSET-<数字>，例如 ASSET-1"
            )
