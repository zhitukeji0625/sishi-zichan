export type ReadFormDataResult =
  | { ok: true; formData: FormData }
  | { ok: false; message: string };

/** Parse multipart or urlencoded bodies; reject JSON and other types without throwing. */
export async function readFormData(req: Request): Promise<ReadFormDataResult> {
  const contentType = req.headers.get("content-type") ?? "";
  const allowed =
    contentType.includes("multipart/form-data") ||
    contentType.includes("application/x-www-form-urlencoded");
  if (!allowed) {
    return { ok: false, message: "请使用 multipart/form-data 提交表单" };
  }
  try {
    return { ok: true, formData: await req.formData() };
  } catch {
    return { ok: false, message: "无法解析表单数据" };
  }
}
