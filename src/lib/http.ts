import { NextResponse } from "next/server";

/** Parse multipart form data; returns 400 response on malformed input. */
export async function readMultipartFormData(
  req: Request,
): Promise<FormData | NextResponse> {
  try {
    return await req.formData();
  } catch {
    return NextResponse.json({ error: "无效的 multipart 请求" }, { status: 400 });
  }
}
