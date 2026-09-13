/**
 * Safely parse multipart form data from a request.
 * Returns 400 instead of throwing when Content-Type is not multipart.
 */
export async function parseMultipartForm(
  req: Request,
): Promise<FormData | { error: string }> {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data")) {
    return { error: "请求须为 multipart/form-data 格式" };
  }
  try {
    return await req.formData();
  } catch {
    return { error: "无法解析表单数据" };
  }
}
