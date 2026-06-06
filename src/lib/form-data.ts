/** Parse multipart form data; returns null when body is missing or not multipart. */
export async function parseFormData(req: Request): Promise<FormData | null> {
  try {
    return await req.formData();
  } catch {
    return null;
  }
}
