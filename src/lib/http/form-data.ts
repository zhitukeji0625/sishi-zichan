/** 仅当 Content-Type 为 multipart 时解析表单，避免非 multipart 请求导致 500 */
export async function parseMultipartFormData(
  req: Request,
): Promise<FormData | null> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return null;
  }
  try {
    return await req.formData();
  } catch {
    return null;
  }
}
