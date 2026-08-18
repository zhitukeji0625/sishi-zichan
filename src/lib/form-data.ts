import { NextResponse } from "next/server";

const MULTIPART_TYPES = ["multipart/form-data", "application/x-www-form-urlencoded"];

/** Parse request body as FormData; return 400 if Content-Type is not form-compatible. */
export async function parseFormData(req: Request): Promise<FormData | NextResponse> {
  const ct = req.headers.get("content-type") ?? "";
  if (!MULTIPART_TYPES.some((t) => ct.includes(t))) {
    return NextResponse.json({ error: "请使用 multipart/form-data 提交" }, { status: 400 });
  }
  try {
    return await req.formData();
  } catch {
    return NextResponse.json({ error: "表单数据解析失败" }, { status: 400 });
  }
}
