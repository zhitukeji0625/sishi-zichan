import { NextResponse } from "next/server";

/**
 * Safely parse multipart form data. Returns 400 if Content-Type is not multipart
 * or if parsing fails.
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
    return NextResponse.json({ error: "表单数据无效" }, { status: 400 });
  }
}
