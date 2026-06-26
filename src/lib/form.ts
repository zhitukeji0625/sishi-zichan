/** Parse multipart or urlencoded form body; returns null when Content-Type is unsupported. */
export async function parseRequestFormData(req: Request): Promise<FormData | null> {
  try {
    return await req.formData();
  } catch {
    return null;
  }
}
