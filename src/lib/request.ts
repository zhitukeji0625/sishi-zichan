/** Parse multipart or urlencoded form bodies; returns 400 JSON on wrong Content-Type. */
export async function parseFormData(
  req: Request,
): Promise<{ ok: true; data: FormData } | { ok: false; response: Response }> {
  const ct = req.headers.get("content-type") ?? "";
  if (
    !ct.includes("multipart/form-data") &&
    !ct.includes("application/x-www-form-urlencoded")
  ) {
    return {
      ok: false,
      response: Response.json({ error: "请使用表单提交（multipart/form-data）" }, { status: 400 }),
    };
  }
  try {
    return { ok: true, data: await req.formData() };
  } catch {
    return {
      ok: false,
      response: Response.json({ error: "无法解析表单数据" }, { status: 400 }),
    };
  }
}
