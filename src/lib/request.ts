/**
 * 解析 POST 请求体为字符串键值对（表单字段、JSON 对象的一级字段）。
 * 避免在 Content-Type 与 formData() 不匹配时抛出 500。
 */
export async function parseRequestFields(
  req: Request,
): Promise<Record<string, string>> {
  const contentType = req.headers.get("content-type")?.toLowerCase() ?? "";

  if (contentType.includes("application/json")) {
    const json = await req.json().catch(() => null);
    if (!json || typeof json !== "object" || Array.isArray(json)) {
      return {};
    }
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(json)) {
      if (value === undefined || value === null) continue;
      if (typeof value === "string") out[key] = value;
      else if (typeof value === "number" || typeof value === "boolean") {
        out[key] = String(value);
      }
    }
    return out;
  }

  if (
    contentType.includes("multipart/form-data") ||
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType === ""
  ) {
    try {
      const formData = await req.formData();
      const out: Record<string, string> = {};
      for (const [key, value] of formData.entries()) {
        if (typeof value === "string") out[key] = value;
      }
      return out;
    } catch {
      return {};
    }
  }

  return {};
}
