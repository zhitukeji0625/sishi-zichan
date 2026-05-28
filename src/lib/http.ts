/** Safely parse multipart or urlencoded form bodies; returns null on wrong Content-Type. */
export async function parseRequestFormData(req: Request): Promise<FormData | null> {
  try {
    return await req.formData();
  } catch {
    return null;
  }
}
