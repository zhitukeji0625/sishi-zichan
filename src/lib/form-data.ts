import { NextResponse } from "next/server";

/** Parse multipart or urlencoded bodies; return 400 instead of throwing on bad Content-Type. */
export async function readFormData(req: Request): Promise<FormData | NextResponse> {
  const contentType = req.headers.get("content-type") ?? "";
  if (
    !contentType.includes("multipart/form-data") &&
    !contentType.includes("application/x-www-form-urlencoded")
  ) {
    return NextResponse.json({ error: "请使用 multipart/form-data 提交" }, { status: 400 });
  }
  try {
    return await req.formData();
  } catch {
    return NextResponse.json({ error: "无法解析表单" }, { status: 400 });
  }
}
