const MULTIPART_TYPES = new Set([
  "multipart/form-data",
  "application/x-www-form-urlencoded",
]);

export async function readMultipartForm(
  req: Request,
): Promise<FormData | { error: string }> {
  const contentType = req.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (!contentType || !MULTIPART_TYPES.has(contentType)) {
    return { error: "请使用 multipart/form-data 上传" };
  }
  try {
    return await req.formData();
  } catch {
    return { error: "无法解析表单数据" };
  }
}
