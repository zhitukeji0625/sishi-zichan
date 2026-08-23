/** Parse multipart form data; return 400 response if content-type is not multipart. */
export async function parseFormData(req: Request): Promise<FormData | Response> {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data")) {
    return new Response(JSON.stringify({ error: "请使用 multipart/form-data 提交" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  return req.formData();
}
