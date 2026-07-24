import { NextResponse } from "next/server";

/** Reject non-multipart POST bodies before calling `req.formData()` (avoids 500). */
export function requireMultipartForm(req: Request): NextResponse | null {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.toLowerCase().includes("multipart/form-data")) {
    return NextResponse.json({ error: "请使用 multipart/form-data 提交表单" }, { status: 400 });
  }
  return null;
}

export async function readMultipartForm(req: Request): Promise<FormData | NextResponse> {
  const rejected = requireMultipartForm(req);
  if (rejected) return rejected;
  try {
    return await req.formData();
  } catch {
    return NextResponse.json({ error: "无法解析表单数据" }, { status: 400 });
  }
}
