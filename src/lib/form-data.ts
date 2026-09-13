import { NextResponse } from "next/server";

/**
 * Parse multipart form data from a request.
 * Returns 400 if the request is not multipart/form-data.
 */
export async function parseMultipartForm(
  req: Request,
): Promise<FormData | NextResponse> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json({ error: "需要 multipart/form-data" }, { status: 400 });
  }
  try {
    return await req.formData();
  } catch {
    return NextResponse.json({ error: "表单数据解析失败" }, { status: 400 });
  }
}
