/**
 * Parse multipart/form-data from a Request.
 * Returns 400 JSON response if Content-Type is not multipart or urlencoded.
 */
export async function parseMultipartForm(req: Request): Promise<FormData | Response> {
  const ct = req.headers.get("content-type") ?? "";
  if (
    !ct.includes("multipart/form-data") &&
    !ct.includes("application/x-www-form-urlencoded")
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
