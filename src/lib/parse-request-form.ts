/**
 * 解析 multipart/form-urlencoded 表单；错误 Content-Type 时返回 null 而非抛 500。
 */
export async function parseRequestFormData(req: Request): Promise<FormData | null> {
  const ct = req.headers.get("content-type") ?? "";
  if (
    !ct.includes("multipart/form-data") &&
    !ct.includes("application/x-www-form-urlencoded")
  ) {
    return null;
  }
  try {
    return await req.formData();
  } catch {
    return null;
  }
}
