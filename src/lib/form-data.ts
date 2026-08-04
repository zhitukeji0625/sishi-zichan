export type FormDataParseResult =
  | { ok: true; formData: FormData }
  | { ok: false; error: string };

/** Safely parse multipart or urlencoded bodies; rejects other content types. */
export async function parseFormData(req: Request): Promise<FormDataParseResult> {
  const contentType = req.headers.get("content-type") ?? "";
  if (
    !contentType.includes("multipart/form-data") &&
    !contentType.includes("application/x-www-form-urlencoded")
  ) {
    return { ok: false, error: "请求须为 multipart/form-data 或 application/x-www-form-urlencoded" };
  }
  try {
    return { ok: true, formData: await req.formData() };
  } catch {
    return { ok: false, error: "无法解析表单数据" };
  }
}
