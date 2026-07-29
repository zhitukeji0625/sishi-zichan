/** Parse POST body from multipart/form, urlencoded, or JSON (returns string fields). */
export async function parseFormBody(req: Request): Promise<Record<string, string>> {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body: unknown = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return {};
    }
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      if (value === undefined || value === null) continue;
      out[key] = typeof value === "string" ? value : String(value);
    }
    return out;
  }
  if (
    contentType.includes("multipart/form-data") ||
    contentType.includes("application/x-www-form-urlencoded")
  ) {
    const formData = await req.formData();
    const out: Record<string, string> = {};
    for (const [key, value] of formData.entries()) {
      out[key] = typeof value === "string" ? value : value.name;
    }
    return out;
  }
  return {};
}
