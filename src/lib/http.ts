import { NextResponse } from "next/server";

/** Reject requests that are not multipart/form-data (avoids formData() throwing 500). */
export function requireMultipart(req: Request): NextResponse | null {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data")) {
    return NextResponse.json({ error: "需要 multipart/form-data" }, { status: 400 });
  }
  return null;
}
