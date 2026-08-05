import { NextResponse } from "next/server";

/** Returns FormData or a 400 response when the request is not multipart. */
export async function parseMultipartForm(req: Request): Promise<FormData | NextResponse> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json({ error: "需要 multipart 表单" }, { status: 400 });
  }
  try {
    return await req.formData();
  } catch {
    return NextResponse.json({ error: "需要 multipart 表单" }, { status: 400 });
  }
}
