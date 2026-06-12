/** Parse multipart or urlencoded form bodies; return null when Content-Type is unsupported. */
export async function parseRequestFormData(req: Request): Promise<FormData | null> {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data") && !ct.includes("application/x-www-form-urlencoded")) {
    return null;
  }
  try {
    return await req.formData();
  } catch {
    return null;
  }
}
