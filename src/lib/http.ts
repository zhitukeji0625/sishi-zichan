import { NextResponse } from "next/server";

/** Returns 400 if Content-Type is not multipart/form-data. */
export function requireMultipartForm(req: Request): NextResponse | null {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data")) {
    return NextResponse.json({ error: "请使用 multipart/form-data" }, { status: 400 });
  }
  return null;
}
