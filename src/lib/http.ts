import { NextResponse } from "next/server";

export type MultipartReadResult =
  | { ok: true; formData: FormData }
  | { ok: false; response: NextResponse };

/** Parse multipart body; returns 400 instead of throwing on bad Content-Type. */
export async function readMultipartForm(req: Request): Promise<MultipartReadResult> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return {
      ok: false,
      response: NextResponse.json({ error: "请求须为 multipart/form-data" }, { status: 400 }),
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
