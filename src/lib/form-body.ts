/** Parse multipart or urlencoded form body; returns null when content-type is unsupported. */
export async function parseFormBody(req: Request): Promise<FormData | null> {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data") && !ct.includes("application/x-www-form-urlencoded")) {
    return null;
  }
  try {
    return await req.formData();
  } catch {
    return null;
  }
}
