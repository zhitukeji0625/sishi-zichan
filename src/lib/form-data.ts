/** 仅接受 multipart/form-data；否则返回 null（路由应返回 400）。 */
export async function parseMultipartForm(req: Request): Promise<FormData | null> {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data")) return null;
  try {
    return await req.formData();
  } catch {
    return null;
  }
}
