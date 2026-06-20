import { NextResponse } from "next/server";

/** Reject non-multipart POST bodies with 400 instead of letting formData() throw 500. */
export function requireMultipartForm(req: Request): NextResponse | null {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data")) {
    return NextResponse.json({ error: "请使用 multipart/form-data 提交" }, { status: 400 });
  }
  return null;
}
