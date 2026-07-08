import { NextResponse } from "next/server";

/** Return 400 if request is not multipart/form-data (avoids req.formData() throwing). */
export function requireMultipartForm(req: Request): NextResponse | null {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data") && !ct.includes("application/x-www-form-urlencoded")) {
    return NextResponse.json({ error: "请使用 multipart/form-data 提交" }, { status: 400 });
  }
  return null;
}
