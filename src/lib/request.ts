function formDataToRecord(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

function objectToStringRecord(obj: unknown): Record<string, string> | null {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    out[key] = String(value);
  }
  return out;
}

async function tryFormData(req: Request): Promise<Record<string, string> | null> {
  try {
    const fd = await req.formData();
    if ([...fd.keys()].length === 0) return null;
    return formDataToRecord(fd);
  } catch {
    return null;
  }
}

async function tryJson(req: Request): Promise<Record<string, string> | null> {
  try {
    const text = await req.text();
    if (!text.trim()) return null;
    return objectToStringRecord(JSON.parse(text));
  } catch {
    return null;
  }
}

/** 解析 POST 请求体为字符串字段（支持 multipart、urlencoded、JSON；容错错误 Content-Type） */
export async function parseRequestFields(req: Request): Promise<Record<string, string>> {
  const ct = (req.headers.get("content-type") ?? "").toLowerCase();

  if (ct.includes("multipart/form-data") || ct.includes("application/x-www-form-urlencoded")) {
    const fromForm = await tryFormData(req);
    if (fromForm) return fromForm;
  }

  if (ct.includes("application/json")) {
    const fromJson = await tryJson(req);
    if (fromJson) return fromJson;
  }

  const fromForm = await tryFormData(req.clone());
  if (fromForm) return fromForm;

  const fromJson = await tryJson(req.clone());
  if (fromJson) return fromJson;

  return {};
}
