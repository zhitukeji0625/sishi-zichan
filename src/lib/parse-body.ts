export type ParseFormBodyResult =
  | { ok: true; data: Record<string, string> }
  | { ok: false; status: number; error: string };

/** Accepts multipart, urlencoded, or JSON bodies as flat string fields. */
export async function parseFormBody(req: Request): Promise<ParseFormBodyResult> {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return { ok: false, status: 400, error: "请求体无效" };
    }
    const data: Record<string, string> = {};
    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      if (value === undefined || value === null) continue;
      data[key] = typeof value === "string" ? value : String(value);
    }
    return { ok: true, data };
  }
  if (
    contentType.includes("multipart/form-data") ||
    contentType.includes("application/x-www-form-urlencoded")
  ) {
    const formData = await req.formData();
    const data: Record<string, string> = {};
    for (const [key, value] of formData.entries()) {
      data[key] = typeof value === "string" ? value : value.name;
    }
    return { ok: true, data };
  }
  return { ok: false, status: 400, error: "不支持的 Content-Type" };
}
