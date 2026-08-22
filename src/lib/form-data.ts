/** 解析 multipart/form-data 请求；非 multipart 返回 null */
export async function parseMultipartFormData(req: Request): Promise<FormData | null> {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data")) return null;
  return req.formData();
}
