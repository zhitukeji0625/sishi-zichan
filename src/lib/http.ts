/** Parse multipart body; returns null when the request is not valid FormData. */
export async function readMultipartFormData(req: Request): Promise<FormData | null> {
  try {
    return await req.formData();
  } catch {
    return null;
  }
}
