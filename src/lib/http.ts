import { NextResponse } from "next/server";

function isFormContentType(contentType: string): boolean {
  const ct = contentType.toLowerCase();
  return ct.includes("multipart/form-data") || ct.includes("application/x-www-form-urlencoded");
}

/** Parse multipart or urlencoded body; returns 400 if Content-Type is wrong or body cannot be parsed. */
export async function readMultipartForm(
  req: Request,
): Promise<FormData | NextResponse> {
  if (!isFormContentType(req.headers.get("content-type") ?? "")) {
    return NextResponse.json({ error: "需要 multipart 表单" }, { status: 400 });
  }
  try {
    return await req.formData();
  } catch {
    return NextResponse.json({ error: "无法解析表单" }, { status: 400 });
  }
}
