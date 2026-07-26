/** Returns true when the request body is form-encoded (multipart or urlencoded). */
export function isFormContentType(req: Request): boolean {
  const ct = req.headers.get("content-type") ?? "";
  return ct.includes("multipart/form-data") || ct.includes("application/x-www-form-urlencoded");
}
