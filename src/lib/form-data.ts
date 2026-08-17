import { NextResponse } from "next/server";

/** Parse multipart or urlencoded form body; returns 400 on invalid content type or parse failure. */
export async function parseRequestFormData(
  req: Request,
): Promise<FormData | NextResponse> {
  const contentType = req.headers.get("content-type") ?? "";
  if (
    !contentType.includes("multipart/form-data") &&
    !contentType.includes("application/x-www-form-urlencoded")
  ) {
    return NextResponse.json({ error: "需要 multipart/form-data 表单" }, { status: 400 });
  }
  try {
    return await req.formData();
  } catch {
    return NextResponse.json({ error: "无法解析表单数据" }, { status: 400 });
  }
}
