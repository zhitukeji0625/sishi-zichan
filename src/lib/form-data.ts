import { NextResponse } from "next/server";

const MULTIPART_TYPES = ["multipart/form-data", "application/x-www-form-urlencoded"];

/** 解析 multipart 表单；非表单请求返回 400，避免 req.formData() 抛错导致 500。 */
export async function parseMultipartForm(
  req: Request,
): Promise<FormData | NextResponse> {
  const contentType = req.headers.get("content-type") ?? "";
  const allowed = MULTIPART_TYPES.some((t) => contentType.includes(t));
  if (!allowed) {
    return NextResponse.json({ error: "请使用 multipart 表单提交" }, { status: 400 });
  }
  try {
    return await req.formData();
  } catch {
    return NextResponse.json({ error: "表单解析失败" }, { status: 400 });
  }
}
