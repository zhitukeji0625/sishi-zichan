import { NextResponse } from "next/server";

export type MultipartFormResult =
  | { ok: true; formData: FormData }
  | { ok: false; response: NextResponse };

/** Parse multipart/form-data; returns 400 instead of throwing on invalid Content-Type. */
export async function parseMultipartForm(req: Request): Promise<MultipartFormResult> {
  const ct = req.headers.get("content-type") ?? "";
  if (
    !ct.includes("multipart/form-data") &&
    !ct.includes("application/x-www-form-urlencoded")
  ) {
    return {
      ok: false,
      response: NextResponse.json({ error: "请使用 multipart/form-data 提交表单" }, { status: 400 }),
    };
  }
  try {
    const formData = await req.formData();
    return { ok: true, formData };
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "表单解析失败" }, { status: 400 }),
    };
  }
}
