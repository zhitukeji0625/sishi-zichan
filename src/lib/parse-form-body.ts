export type ParseFormBodyResult =
  | { ok: true; data: Record<string, string> }
  | { ok: false; error: string };

/** 解析 multipart/form-urlencoded 或 application/json 请求体为字符串键值对。 */
export async function parseFormBody(req: Request): Promise<ParseFormBodyResult> {
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return { ok: false, error: "无效的 JSON 请求体" };
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
    try {
      const formData = await req.formData();
      const data = Object.fromEntries(
        [...formData.entries()].map(([key, value]) => [
          key,
          typeof value === "string" ? value : String(value),
        ]),
      );
      return { ok: true, data };
    } catch {
      return { ok: false, error: "无法解析表单" };
    }
  }

  return { ok: false, error: "不支持的 Content-Type" };
}
