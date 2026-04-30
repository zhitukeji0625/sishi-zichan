"""核心业务占位逻辑。"""


def project_name() -> str:
    """返回项目名称（与 README 一致）。"""
    return "sishi-zichan"


def health() -> dict[str, str | bool]:
    """简单健康检查载荷，供集成测试或探活使用。"""
    return {"status": "ok", "project": project_name()}
