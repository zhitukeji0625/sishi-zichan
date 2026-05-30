/** Parse multipart form data; returns null when Content-Type is invalid or body cannot be parsed. */
export async function readMultipartFormData(req: Request): Promise<FormData | null> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) return null;
  try {
    return await req.formData();
  } catch {
    return null;
  }
}
