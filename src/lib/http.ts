import { NextResponse } from "next/server";

/** Reject requests that are not multipart form uploads (avoids formData() throwing 500). */
export function requireMultipartForm(req: Request): NextResponse | null {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json(
      { error: "需要 multipart/form-data" },
      { status: 400 },
    );
  }
  return null;
}
