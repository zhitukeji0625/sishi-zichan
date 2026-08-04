import { NextResponse } from "next/server";

/**
 * 解析 multipart/form-data；非 multipart 或解析失败时返回 400 响应。
 */
export async function parseFormData(req: Request): Promise<FormData | NextResponse> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json({ error: "请使用 multipart/form-data 提交" }, { status: 400 });
  }
  try {
    return await req.formData();
  } catch {
    return NextResponse.json({ error: "无法解析表单数据" }, { status: 400 });
  }
}
