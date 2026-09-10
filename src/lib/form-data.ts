import { NextResponse } from "next/server";

/**
 * Safely parse multipart form data. Returns 400 if the request is not multipart
 * or the body cannot be parsed as form data.
 */
export async function parseMultipartForm(
  req: Request,
): Promise<FormData | NextResponse> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json(
      { error: "请求须为 multipart/form-data 格式" },
      { status: 400 },
    );
  }
  try {
    return await req.formData();
  } catch {
    return NextResponse.json(
      { error: "无法解析表单数据" },
      { status: 400 },
    );
  }
}
