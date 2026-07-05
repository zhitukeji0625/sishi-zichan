import { NextResponse } from "next/server";

/** Returns 400 when the request is not multipart/form-data (avoids 500 from formData()). */
export async function requireMultipartForm(req: Request): Promise<FormData | NextResponse> {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data")) {
    return NextResponse.json({ error: "请使用 multipart/form-data 提交" }, { status: 400 });
  }
  try {
    return await req.formData();
  } catch {
    return NextResponse.json({ error: "表单数据解析失败" }, { status: 400 });
  }
}
