/** Safely parse multipart/form-data; returns an error message for non-multipart requests. */
export async function parseMultipartForm(
  req: Request,
): Promise<{ ok: true; formData: FormData } | { ok: false; error: string }> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return { ok: false, error: "需要 multipart/form-data" };
  }
  try {
    const formData = await req.formData();
    return { ok: true, formData };
  } catch {
    return { ok: false, error: "无法解析表单" };
  }
}
