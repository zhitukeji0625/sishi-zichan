/**
 * Parse multipart/form-data from a request, returning 400 when Content-Type is invalid.
 */
export async function parseRequestFormData(
  req: Request,
): Promise<FormData | Response> {
  const contentType = req.headers.get("content-type") ?? "";
  if (
    !contentType.includes("multipart/form-data") &&
    !contentType.includes("application/x-www-form-urlencoded")
  ) {
    return new Response(JSON.stringify({ error: "请使用 multipart/form-data 提交" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  try {
    return await req.formData();
  } catch {
    return new Response(JSON.stringify({ error: "表单数据解析失败" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
}
