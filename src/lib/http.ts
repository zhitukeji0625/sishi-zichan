import { NextResponse } from "next/server";

/** 仅接受 multipart/form-data；否则返回 400，避免 formData() 抛 500 */
export async function requireMultipartForm(req: Request): Promise<FormData | NextResponse> {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data")) {
    return NextResponse.json({ error: "请使用 multipart/form-data 提交" }, { status: 400 });
  }
  try {
    return await req.formData();
  } catch {
    return NextResponse.json({ error: "表单数据无效" }, { status: 400 });
  }
}

export function isNextResponse(v: FormData | NextResponse): v is NextResponse {
  return v instanceof NextResponse;
}
