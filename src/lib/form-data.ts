import { NextResponse } from "next/server";

export type ParseMultipartResult =
  | { ok: true; formData: FormData }
  | { ok: false; response: NextResponse };

/** 仅接受 multipart/form-data；错误 Content-Type 或解析失败时返回 400，避免未捕获异常导致 500。 */
export async function parseMultipartForm(req: Request): Promise<ParseMultipartResult> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
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
      response: NextResponse.json({ error: "无法解析上传表单" }, { status: 400 }),
    };
  }
}
