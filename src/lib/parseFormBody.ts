/** 管理端资产等接口：支持 multipart/form-data 与 application/json。 */
export async function parseFormBody(req: Request): Promise<Record<string, string>> {
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new ParseBodyError("JSON 无效", 400);
    }
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
      if (v === undefined || v === null) continue;
      out[k] = typeof v === "string" ? v : String(v);
    }
    return out;
  }
  const formData = await req.formData();
  const raw = Object.fromEntries(formData.entries());
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "string") out[k] = v;
    else if (v instanceof File) out[k] = v.name;
  }
  return out;
}

export class ParseBodyError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ParseBodyError";
  }
}
