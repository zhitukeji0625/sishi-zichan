/**
 * Safely parse multipart/form-data requests.
 * Returns null when Content-Type is not multipart/form-data.
 */
export async function parseMultipartForm(req: Request): Promise<FormData | null> {
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
