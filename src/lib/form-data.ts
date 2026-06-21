/**
 * 安全解析 multipart/form-data 或 application/x-www-form-urlencoded 请求体。
 * 错误 Content-Type 时返回 null，避免未捕获异常导致 500。
 */
export async function parseFormData(req: Request): Promise<FormData | null> {
  const contentType = req.headers.get("content-type") ?? "";
  if (
    !contentType.includes("multipart/form-data") &&
    !contentType.includes("application/x-www-form-urlencoded")
  ) {
    return null;
  }
  try {
    return await req.formData();
  } catch {
    return null;
  }
}
