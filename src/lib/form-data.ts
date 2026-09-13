/**
 * Safely parse multipart/form-data requests.
 * Returns an error object when Content-Type is not multipart or parsing fails.
 */
export async function parseMultipartForm(
  req: Request,
): Promise<FormData | { error: string }> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return { error: "请求须为 multipart/form-data" };
  }
  try {
    return await req.formData();
  } catch {
    return { error: "无法解析表单数据" };
  }
}
