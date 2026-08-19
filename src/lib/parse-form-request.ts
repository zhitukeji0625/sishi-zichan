export type FormParseResult =
  | { ok: true; formData: FormData }
  | { ok: false; error: string };

/** Parse multipart or urlencoded bodies; reject unsupported content types without throwing. */
export async function parseFormRequest(req: Request): Promise<FormParseResult> {
  const contentType = req.headers.get("content-type") ?? "";
  const isForm =
    contentType.includes("multipart/form-data") ||
    contentType.includes("application/x-www-form-urlencoded");
  if (!isForm) {
    return { ok: false, error: "需要 multipart/form-data 或 form-urlencoded 请求" };
  }
  try {
    return { ok: true, formData: await req.formData() };
  } catch {
    return { ok: false, error: "无法解析表单数据" };
  }
}
