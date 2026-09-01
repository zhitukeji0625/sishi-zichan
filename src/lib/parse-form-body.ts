/** Parse multipart or urlencoded form bodies from admin asset APIs. */
export async function parseFormBody(req: Request): Promise<Record<string, string> | null> {
  const contentType = req.headers.get("content-type") ?? "";
  if (
    !contentType.includes("multipart/form-data") &&
    !contentType.includes("application/x-www-form-urlencoded")
  ) {
    return null;
  }
  const formData = await req.formData();
  const raw: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") raw[key] = value;
  }
  return raw;
}
