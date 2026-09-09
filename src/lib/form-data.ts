import { NextResponse } from "next/server";

const MULTIPART_TYPES = ["multipart/form-data", "application/x-www-form-urlencoded"];

export async function parseMultipartForm(req: Request): Promise<FormData | NextResponse> {
  const ct = req.headers.get("content-type") ?? "";
  const ok = MULTIPART_TYPES.some((t) => ct.includes(t));
  if (!ok) {
    return NextResponse.json({ error: "请使用 multipart/form-data 提交" }, { status: 400 });
  }
  try {
    return await req.formData();
  } catch {
    return NextResponse.json({ error: "表单数据解析失败" }, { status: 400 });
  }
}
