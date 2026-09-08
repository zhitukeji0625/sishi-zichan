export type ParseMultipartResult =
  | { ok: true; formData: FormData }
  | { ok: false; error: string };

export async function parseMultipartFormData(req: Request): Promise<ParseMultipartResult> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return { ok: false, error: "请求须为 multipart/form-data 格式" };
  }
  try {
    const formData = await req.formData();
    return { ok: true, formData };
  } catch {
    return { ok: false, error: "无法解析表单数据" };
  }
}
