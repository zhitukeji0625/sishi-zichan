import { NextResponse } from "next/server";

/** Reject non-multipart POST bodies before calling `req.formData()`. */
export function requireMultipart(req: Request) {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data")) {
    return NextResponse.json({ error: "需要 multipart/form-data" }, { status: 400 });
  }
  return null;
}
