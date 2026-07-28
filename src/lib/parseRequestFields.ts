/** Parse flat string fields from JSON or HTML form bodies (admin asset APIs). */
export async function parseRequestFields(
  req: Request,
): Promise<Record<string, string>> {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const json = await req.json().catch(() => null);
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
    contentType.includes("multipart/form-data") ||
    contentType.includes("application/x-www-form-urlencoded")
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
