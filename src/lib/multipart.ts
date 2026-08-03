/** Parse form body; returns null when Content-Type is not form-urlencoded or multipart. */
export async function parseMultipartFormData(req: Request): Promise<FormData | null> {
  const ct = req.headers.get("content-type") ?? "";
  if (
    !ct.includes("multipart/form-data") &&
    !ct.includes("application/x-www-form-urlencoded")
  ) {
    return null;
  }
  return req.formData();
}
