import { NextResponse } from "next/server";

const FORM_CONTENT_TYPES = ["multipart/form-data", "application/x-www-form-urlencoded"];

export async function parseFormData(req: Request): Promise<FormData | NextResponse> {
  const ct = req.headers.get("content-type") ?? "";
  const isForm = FORM_CONTENT_TYPES.some((t) => ct.includes(t));
  if (!isForm) {
    return NextResponse.json({ error: "请使用 multipart/form-data 提交" }, { status: 400 });
  }
  try {
    return await req.formData();
  } catch {
    return NextResponse.json({ error: "表单数据解析失败" }, { status: 400 });
  }
}
