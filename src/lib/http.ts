/** Safely parse multipart form data; returns null when the body is not valid FormData. */
export async function readMultipartFormData(req: Request): Promise<FormData | null> {
  try {
    return await req.formData();
  } catch {
    return null;
  }
}
