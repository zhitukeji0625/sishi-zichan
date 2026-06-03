/** Parse admin asset form fields from multipart or JSON body. */
export async function parseAdminFormBody(req: Request): Promise<Record<string, string>> {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const json = await req.json().catch(() => null);
    if (!json || typeof json !== "object") return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(json as Record<string, unknown>)) {
      if (v === undefined || v === null) continue;
      out[k] = String(v);
    }
    return out;
  }
  if (
    contentType.includes("multipart/form-data") ||
    contentType.includes("application/x-www-form-urlencoded")
  ) {
    const formData = await req.formData();
    const out: Record<string, string> = {};
    for (const [k, v] of formData.entries()) {
      if (typeof v === "string") out[k] = v;
    }
    return out;
  }
  throw new Error("UNSUPPORTED_CONTENT_TYPE");
}
