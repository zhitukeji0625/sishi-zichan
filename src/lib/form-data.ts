/**
 * Safely parse multipart form data from a request.
 * Returns null if the request is not multipart or parsing fails.
 */
export async function parseMultipartForm(
  req: Request,
): Promise<FormData | null> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return null;
  }
  try {
    return await req.formData();
  } catch {
    return null;
  }
}
