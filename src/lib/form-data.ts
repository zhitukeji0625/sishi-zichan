/** 安全解析 multipart 表单；非 multipart 或解析失败时返回 null（调用方应返回 400）。 */
export async function parseMultipartFormData(req: Request): Promise<FormData | null> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return null;
  }
  try {
    return await req.formData();
  } catch {
    return null;
  }
}
