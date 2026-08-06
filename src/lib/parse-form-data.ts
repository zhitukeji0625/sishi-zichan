import { NextResponse } from "next/server";

/** Parse multipart or urlencoded form; return 400 JSON on invalid or missing body. */
export async function parseRequestFormData(req: Request): Promise<FormData | NextResponse> {
  const contentType = req.headers.get("content-type") ?? "";
  if (
    !contentType.includes("multipart/form-data") &&
    !contentType.includes("application/x-www-form-urlencoded")
  ) {
    return NextResponse.json({ error: "需要表单提交（multipart/form-data）" }, { status: 400 });
  }
  try {
    return await req.formData();
  } catch {
    return NextResponse.json({ error: "表单解析失败" }, { status: 400 });
  }
}
