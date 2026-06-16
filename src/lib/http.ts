import { NextResponse } from "next/server";

/** Returns 400 if the request is not multipart/form-data or form parsing fails. */
export async function requireMultipartForm(
  req: Request,
): Promise<FormData | NextResponse> {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data")) {
    return NextResponse.json({ error: "需要 multipart 表单" }, { status: 400 });
  }
  try {
    return await req.formData();
  } catch {
    return NextResponse.json({ error: "表单解析失败" }, { status: 400 });
  }
}
