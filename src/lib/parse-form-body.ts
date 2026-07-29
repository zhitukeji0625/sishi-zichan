/** Parse POST body as multipart form or JSON (values coerced to strings). */
export async function parseFormBody(req: Request): Promise<Record<string, string>> {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body: unknown = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return {};
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(body)) {
      if (value === undefined || value === null) continue;
      out[key] = String(value);
    }
    return out;
  }
  const formData = await req.formData();
  return Object.fromEntries(formData.entries()) as Record<string, string>;
}
