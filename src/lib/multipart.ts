import { NextResponse } from "next/server";

const MULTIPART_RE = /^multipart\/form-data\b/i;

/** Parse multipart form data; return 400 if Content-Type is not multipart. */
export async function parseMultipartFormData(req: Request): Promise<FormData | NextResponse> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!MULTIPART_RE.test(contentType)) {
    return NextResponse.json({ error: "请使用 multipart/form-data 提交" }, { status: 400 });
  }
  try {
    return await req.formData();
  } catch {
    return NextResponse.json({ error: "表单数据无效" }, { status: 400 });
  }
}
