import { NextResponse } from "next/server";

/** Reject non-multipart bodies before calling req.formData() (which throws on JSON). */
export function requireMultipartForm(req: Request): NextResponse | null {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data")) {
    return NextResponse.json({ error: "请使用 multipart/form-data 上传" }, { status: 400 });
  }
  return null;
}
