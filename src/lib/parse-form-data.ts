import { NextResponse } from "next/server";

/** Parse multipart form data; returns 400 if Content-Type is wrong or body is invalid. */
export async function readMultipartFormData(
  req: Request,
): Promise<FormData | NextResponse> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json({ error: "需要 multipart/form-data" }, { status: 400 });
  }
  try {
    return await req.formData();
  } catch {
    return NextResponse.json({ error: "无法解析表单数据" }, { status: 400 });
  }
}
