/** Parse multipart form data; returns 400-friendly error on invalid content type. */
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
