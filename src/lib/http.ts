/** Reject non-multipart requests before calling req.formData() (which throws). */
export function requireMultipart(req: Request): Response | null {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data")) {
    return Response.json({ error: "请使用 multipart/form-data 提交" }, { status: 400 });
  }
  return null;
}
