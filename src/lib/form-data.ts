/**
 * 安全解析 multipart/form-data 请求体。
 * 非 multipart 请求返回 null，避免 req.formData() 抛出 500。
 */
export async function parseMultipartForm(req: Request): Promise<FormData | null> {
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
