import { NextResponse } from "next/server";

/** 解析 multipart/form-data 请求；非 multipart 返回 400 响应 */
export async function parseMultipartForm(
  req: Request,
): Promise<FormData | NextResponse> {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data")) {
    return NextResponse.json({ error: "需要 multipart/form-data" }, { status: 400 });
  }
  return req.formData();
}
