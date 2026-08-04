import { NextResponse } from "next/server";

const ALLOWED = new Set(["multipart/form-data", "application/x-www-form-urlencoded"]);

/** Parse multipart/form-urlencoded body; returns 400 response if Content-Type is invalid. */
export async function parseFormData(req: Request): Promise<FormData | NextResponse> {
  const ct = req.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!ALLOWED.has(ct)) {
    return NextResponse.json({ error: "请使用 multipart/form-data 提交" }, { status: 400 });
  }
  try {
    return await req.formData();
  } catch {
    return NextResponse.json({ error: "表单数据解析失败" }, { status: 400 });
  }
}
