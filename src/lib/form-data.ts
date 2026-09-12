/**
 * Safely parse multipart/form-data. Returns null when Content-Type is invalid
 * or the body cannot be parsed (caller should respond with 400).
 */
export async function parseMultipartForm(req: Request): Promise<FormData | null> {
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
