/** Parse POST body from multipart/form-data or application/json. */
export async function parseRequestBody(req: Request): Promise<Record<string, string>> {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const json = await req.json().catch(() => null);
    if (!json || typeof json !== "object") return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(json as Record<string, unknown>)) {
      if (v != null) out[k] = String(v);
    }
    return out;
  }
  try {
    const formData = await req.formData();
    return Object.fromEntries(formData.entries()) as Record<string, string>;
  } catch {
    return {};
  }
}
