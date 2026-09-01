import { NextResponse } from "next/server";

/** Parse multipart form data; returns 400 if Content-Type is not multipart. */
export async function readMultipartFormData(req: Request): Promise<
  { ok: true; formData: FormData } | { ok: false; response: NextResponse }
> {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data")) {
    return {
      ok: false,
      response: NextResponse.json({ error: "请使用 multipart/form-data 提交" }, { status: 400 }),
    };
  }
  try {
    const formData = await req.formData();
    return { ok: true, formData };
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "无法解析表单数据" }, { status: 400 }),
    };
  }
}
