/** Returns false when Content-Type is not multipart/form-data. */
export function isMultipartForm(req: Request): boolean {
  const ct = req.headers.get("content-type") ?? "";
  return ct.includes("multipart/form-data");
}
