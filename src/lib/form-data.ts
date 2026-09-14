/** Parse multipart body; returns null when Content-Type is not multipart or body is invalid. */
export async function parseMultipartForm(req: Request): Promise<FormData | null> {
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
