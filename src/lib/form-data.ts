/** Parse multipart/form-data; return an error object for invalid content types. */
export async function parseMultipartForm(
  req: Request,
): Promise<FormData | { error: string }> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return { error: "需要 multipart/form-data 请求" };
  }
  try {
    return await req.formData();
  } catch {
    return { error: "无法解析表单数据" };
  }
}
