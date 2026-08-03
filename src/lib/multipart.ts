/**
 * Safely parse multipart form data. Returns null when the request is not
 * multipart or the body cannot be parsed (instead of throwing).
 */
export async function parseMultipartFormData(req: Request): Promise<FormData | null> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return null;
  }
  try {
    return await req.formData();
  } catch {
    return null;
  }
}
