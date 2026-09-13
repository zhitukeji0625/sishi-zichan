import { NextResponse } from "next/server";

/** Parse multipart form data; returns 400 response if content-type is wrong. */
export async function parseMultipartForm(req: Request): Promise<FormData | NextResponse> {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data")) {
    return NextResponse.json({ error: "请使用 multipart/form-data 提交" }, { status: 400 });
  }
  try {
    return await req.formData();
  } catch {
    return NextResponse.json({ error: "表单数据无效" }, { status: 400 });
  }
}
