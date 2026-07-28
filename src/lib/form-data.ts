export type FormDataResult =
  | { ok: true; formData: FormData }
  | { ok: false; error: string };

/** Reject non-multipart bodies so callers return 400 instead of 500 from `req.formData()`. */
export async function readFormData(req: Request): Promise<FormDataResult> {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data")) {
    return { ok: false, error: "请使用 multipart/form-data 提交" };
  }
  try {
    const formData = await req.formData();
    return { ok: true, formData };
  } catch {
    return { ok: false, error: "表单数据无效" };
  }
}
