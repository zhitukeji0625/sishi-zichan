/** True when the request body is multipart or urlencoded form (safe to call formData()). */
export function isFormContentType(req: Request): boolean {
  const ct = req.headers.get("content-type") ?? "";
  return ct.includes("multipart/form-data") || ct.includes("application/x-www-form-urlencoded");
}

/** Parse multipart body; returns 400 JSON Response on invalid content type or parse errors. */
export async function readMultipartForm(
  req: Request,
): Promise<FormData | Response> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return Response.json({ error: "需要 multipart/form-data" }, { status: 400 });
  }
  try {
    return await req.formData();
  } catch {
    return Response.json({ error: "无法解析 multipart 表单" }, { status: 400 });
  }
}
