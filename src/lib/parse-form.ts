import { NextResponse } from "next/server";

/** 管理端资产等接口仅接受 multipart/form-data；错误 Content-Type 时避免 500。 */
export async function parseRequestFormData(req: Request): Promise<FormData | NextResponse> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json({ error: "请使用表单（multipart/form-data）提交" }, { status: 400 });
  }
  try {
    return await req.formData();
  } catch {
    return NextResponse.json({ error: "无法解析表单数据" }, { status: 400 });
  }
}
