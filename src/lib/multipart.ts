import { NextResponse } from "next/server";

/** Parse multipart form data; returns a 400 response when the request is not multipart. */
export async function parseMultipartFormData(
  req: Request,
): Promise<FormData | NextResponse> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json({ error: "请求须为 multipart/form-data" }, { status: 400 });
  }
  try {
    return await req.formData();
  } catch {
    return NextResponse.json({ error: "无法解析表单数据" }, { status: 400 });
  }
}

export function isNextResponse(value: FormData | NextResponse): value is NextResponse {
  return value instanceof NextResponse;
}
