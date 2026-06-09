/** Parse multipart or urlencoded form bodies; returns null when Content-Type is unsupported. */
export async function parseRequestFormData(req: Request): Promise<FormData | null> {
  const type = req.headers.get("content-type") ?? "";
  if (
    !type.includes("multipart/form-data") &&
    !type.includes("application/x-www-form-urlencoded")
  ) {
    return null;
  }
  try {
    return await req.formData();
  } catch {
    return null;
  }
}
