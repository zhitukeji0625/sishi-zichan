import { NextResponse } from "next/server";

const MULTIPART_TYPES = ["multipart/form-data", "application/x-www-form-urlencoded"];

/**
 * Safely parse multipart/form-data. Returns 400 if Content-Type is invalid.
 */
export async function parseMultipartForm(req: Request): Promise<FormData | NextResponse> {
  const ct = req.headers.get("content-type") ?? "";
  const isMultipart = MULTIPART_TYPES.some((t) => ct.includes(t));
  if (!isMultipart) {
    return NextResponse.json({ error: "需要 multipart/form-data 格式" }, { status: 400 });
  }
  try {
    return await req.formData();
  } catch {
    return NextResponse.json({ error: "表单数据解析失败" }, { status: 400 });
  }
}
