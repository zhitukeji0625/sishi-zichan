import { NextResponse } from "next/server";

/** Parse multipart or urlencoded form; returns 400 JSON on unsupported Content-Type. */
export async function readMultipartForm(
  req: Request,
): Promise<FormData | NextResponse> {
  const ct = req.headers.get("content-type") ?? "";
  if (
    !ct.includes("multipart/form-data") &&
    !ct.includes("application/x-www-form-urlencoded")
  ) {
    return NextResponse.json({ error: "请使用表单提交（multipart/form-data）" }, { status: 400 });
  }
  try {
    return await req.formData();
  } catch {
    return NextResponse.json({ error: "表单数据无效" }, { status: 400 });
  }
}
