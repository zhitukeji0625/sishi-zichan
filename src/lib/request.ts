/**
 * Parse POST body fields from JSON, urlencoded, or multipart form data.
 * Avoids 500 when Content-Type is application/json but handlers call req.formData().
 */
export async function parseRequestFields(req: Request): Promise<Record<string, string>> {
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = await req.json().catch(() => ({}));
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

  if (
    contentType.includes("multipart/form-data") ||
    contentType.includes("application/x-www-form-urlencoded")
  ) {
    const formData = await req.formData();
    const out: Record<string, string> = {};
    for (const [key, value] of formData.entries()) {
      if (typeof value === "string") out[key] = value;
      else out[key] = value.name;
    }
    return out;
  }

  try {
    const formData = await req.formData();
    return Object.fromEntries(
      [...formData.entries()].map(([k, v]) => [k, typeof v === "string" ? v : v.name]),
    ) as Record<string, string>;
  } catch {
    const body = await req.json().catch(() => ({}));
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
}
