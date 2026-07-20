import { NextResponse } from "next/server";

/** Returns true when Content-Type is multipart/form-data. */
export function isMultipartRequest(req: Request): boolean {
  const ct = req.headers.get("content-type") ?? "";
  return ct.includes("multipart/form-data");
}

/** Returns a 400 JSON response when the request is not multipart; otherwise null. */
export function requireMultipart(req: Request): NextResponse | null {
  if (!isMultipartRequest(req)) {
    return NextResponse.json({ error: "请使用 multipart/form-data 提交" }, { status: 400 });
  }
  return null;
}
