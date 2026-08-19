import { NextResponse } from "next/server";

/** Parse multipart body; return 400 when Content-Type is not multipart. */
export async function parseMultipartForm(req: Request): Promise<FormData | NextResponse> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json({ error: "请使用 multipart 表单提交" }, { status: 400 });
  }
  return req.formData();
}
