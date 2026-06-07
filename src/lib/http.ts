/** Parse multipart or urlencoded form bodies; returns null when Content-Type is unsupported. */
export async function parseFormBody(req: Request): Promise<FormData | null> {
  const contentType = req.headers.get("content-type") ?? "";
  if (
    !contentType.includes("multipart/form-data") &&
    !contentType.includes("application/x-www-form-urlencoded")
  ) {
    return null;
  }
  try {
    return await req.formData();
  } catch {
    return null;
  }
}
