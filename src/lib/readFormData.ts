/**
 * Parse multipart form data; returns null when the request is not multipart or body is invalid.
 */
export async function readFormData(req: Request): Promise<FormData | null> {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data")) return null;
  try {
    return await req.formData();
  } catch {
    return null;
  }
}
