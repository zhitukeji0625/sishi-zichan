/** Parse multipart/form-urlencoded body; returns null when Content-Type is wrong. */
export async function parseFormData(req: Request): Promise<FormData | null> {
  try {
    return await req.formData();
  } catch {
    return null;
  }
}
