/** Parse multipart/form-data; returns null when Content-Type is invalid. */
export async function parseFormData(req: Request): Promise<FormData | null> {
  try {
    return await req.formData();
  } catch {
    return null;
  }
}
