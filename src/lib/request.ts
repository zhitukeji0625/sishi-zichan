/** Parse POST body as form fields from multipart, urlencoded, or JSON. */
export async function parseRequestFields(req: Request): Promise<Record<string, string>> {
  const contentType = req.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";

  if (contentType === "application/json" || contentType === "text/json") {
    const json = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!json || typeof json !== "object" || Array.isArray(json)) {
      return {};
    }
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(json)) {
      if (value === undefined || value === null) continue;
      out[key] = typeof value === "string" ? value : String(value);
    }
    return out;
  }

  if (
    contentType === "multipart/form-data" ||
    contentType === "application/x-www-form-urlencoded" ||
    contentType === ""
  ) {
    const formData = await req.formData();
    const out: Record<string, string> = {};
    for (const [key, value] of formData.entries()) {
      if (typeof value === "string") out[key] = value;
    }
    return out;
  }

  return {};
}
