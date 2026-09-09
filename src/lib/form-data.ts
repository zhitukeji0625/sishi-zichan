/** Parse multipart form data; returns 400-friendly error on non-multipart requests. */
export async function parseMultipartForm(req: Request): Promise<FormData | { error: string }> {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data")) {
    return { error: "请求须为 multipart/form-data" };
  }
  try {
    return await req.formData();
  } catch {
    return { error: "无法解析表单数据" };
  }
}
