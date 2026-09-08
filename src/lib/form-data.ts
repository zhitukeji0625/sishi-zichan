/**
 * Safely parse multipart/form-data from a Request.
 * Returns null if Content-Type is not multipart or urlencoded.
 */
export async function parseMultipartFormData(req: Request): Promise<FormData | null> {
  const ct = req.headers.get("content-type") ?? "";
  if (
    !ct.includes("multipart/form-data") &&
    !ct.includes("application/x-www-form-urlencoded")
  ) {
    return null;
  }
  try {
    return await req.formData();
  } catch {
    return null;
  }
}
