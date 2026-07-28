/**
 * 将 POST 请求体解析为字符串字段（JSON、表单、multipart 文本字段）。
 */
export async function parseRequestFields(req: Request): Promise<Record<string, string>> {
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const json = await req.json().catch(() => null);
    if (!json || typeof json !== "object" || Array.isArray(json)) return {};
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(json as Record<string, unknown>)) {
      if (value === undefined || value === null) continue;
      if (typeof value === "object") continue;
      out[key] = String(value);
    }
    return out;
  }

  if (
    contentType.includes("multipart/form-data") ||
    contentType.includes("application/x-www-form-urlencoded")
  ) {
    const formData = await req.formData();
    return formFieldsFromFormData(formData);
  }

  try {
    const formData = await req.formData();
    return formFieldsFromFormData(formData);
  } catch {
    const json = await req.json().catch(() => null);
    if (!json || typeof json !== "object" || Array.isArray(json)) return {};
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(json as Record<string, unknown>)) {
      if (value === undefined || value === null) continue;
      if (typeof value === "object") continue;
      out[key] = String(value);
    }
    return out;
  }
}

function formFieldsFromFormData(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}
