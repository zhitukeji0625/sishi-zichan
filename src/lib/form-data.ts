import { NextResponse } from "next/server";

export type ParseMultipartResult =
  | { ok: true; formData: FormData }
  | { ok: false; response: NextResponse };

/** Parse multipart form data; return 400 when Content-Type is not multipart. */
export async function parseMultipartForm(req: Request): Promise<ParseMultipartResult> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
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
      response: NextResponse.json({ error: "表单数据无效" }, { status: 400 }),
    };
  }
}
