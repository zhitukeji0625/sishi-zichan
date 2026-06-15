import { NextResponse } from "next/server";

/** 管理端 multipart 接口：非 multipart 请求返回 400，避免 formData() 抛错。 */
export function requireMultipartForm(req: Request): Response | null {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data")) {
    return NextResponse.json({ error: "请使用 multipart/form-data 上传" }, { status: 400 });
  }
  return null;
}
