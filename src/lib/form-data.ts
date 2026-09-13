/**
 * 安全解析 multipart/form-data 请求体。
 * 非 multipart 请求返回 null（调用方应返回 400）。
 */
export async function parseMultipartForm(req: Request): Promise<FormData | null> {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data")) {
    return null;
  }
  try {
    return await req.formData();
  } catch {
    return null;
  }
}
