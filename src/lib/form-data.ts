export async function parseRequestFormData(req: Request): Promise<FormData | null> {
  try {
    return await req.formData();
  } catch {
    return null;
  }
}
