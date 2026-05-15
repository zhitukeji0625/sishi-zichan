"""sishi-zichan 根包。"""


def project_name() -> str:
    return "sishi-zichan"


def health() -> dict[str, str]:
    return {"status": "ok", "project": project_name()}
