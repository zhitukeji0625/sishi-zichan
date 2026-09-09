/** Parse multipart form data; returns 400 response when Content-Type is not multipart. */
export async function parseMultipartForm(req: Request): Promise<FormData | Response> {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data")) {
    return new Response(JSON.stringify({ error: "需要 multipart/form-data" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  try {
    return await req.formData();
  } catch {
    return new Response(JSON.stringify({ error: "表单数据无效" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
}
