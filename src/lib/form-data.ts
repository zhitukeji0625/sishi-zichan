/**
 * 安全解析 multipart / urlencoded 表单，避免错误 Content-Type 导致未捕获异常（500）。
 */
export async function parseMultipartForm(
  req: Request,
): Promise<{ ok: true; formData: FormData } | { ok: false; error: string }> {
  const contentType = req.headers.get("content-type") ?? "";
  const allowed =
    contentType.includes("multipart/form-data") ||
    contentType.includes("application/x-www-form-urlencoded");
  if (!allowed) {
    return { ok: false, error: "请使用 multipart/form-data 提交表单" };
  }
  try {
    const formData = await req.formData();
    return { ok: true, formData };
  } catch {
    return { ok: false, error: "无法解析表单数据" };
  }
}
