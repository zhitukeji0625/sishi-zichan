/**
 * Parse POST body as flat string fields from multipart/form, urlencoded, or JSON.
 */
export async function parseRequestFields(req: Request): Promise<Record<string, string>> {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await req.json();
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      return {};
    }
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      if (value === undefined || value === null) continue;
      out[key] = typeof value === "string" ? value : String(value);
    }
    return out;
  }
  const formData = await req.formData();
  const raw = Object.fromEntries(formData.entries());
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") out[key] = value;
    else if (value instanceof File) out[key] = value.name;
  }
  return out;
}
