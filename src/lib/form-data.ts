/** Parse multipart/form-data; return null when Content-Type is not supported. */
export async function parseMultipartFormData(req: Request): Promise<FormData | null> {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data") && !ct.includes("application/x-www-form-urlencoded")) {
    return null;
  }
  return req.formData();
}
