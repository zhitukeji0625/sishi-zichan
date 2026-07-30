/** 解析 POST 请求体：支持 multipart/form-data 与 application/json。 */
export async function readFormData(req: Request): Promise<Record<string, string>> {
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    const json = await req.json().catch(() => null);
    if (!json || typeof json !== "object" || Array.isArray(json)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(json)) {
      if (v != null) out[k] = String(v);
    }
    return out;
  }
  const formData = await req.formData();
  const out: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}
