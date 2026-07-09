/** Parse multipart/form-data; returns null when Content-Type is not multipart. */
export async function parseMultipartForm(req: Request): Promise<FormData | null> {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data")) return null;
  try {
    return await req.formData();
  } catch {
    return null;
  }
}
