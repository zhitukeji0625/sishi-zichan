import { NextResponse } from "next/server";

/**
 * Safely parse multipart/form-data from a request.
 * Returns null (caller should respond 400) when Content-Type is not multipart.
 */
export async function parseMultipartForm(req: Request): Promise<FormData | null> {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data") && !ct.includes("application/x-www-form-urlencoded")) {
    return null;
  }
  try {
    return await req.formData();
  } catch {
    return null;
  }
}

export function badFormDataResponse() {
  return NextResponse.json({ error: "请使用 multipart/form-data 提交" }, { status: 400 });
}
