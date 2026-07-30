import { NextResponse } from "next/server";

/** Parse multipart or urlencoded form data; returns null when Content-Type is invalid. */
export async function readMultipartFormData(req: Request): Promise<FormData | null> {
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

export function invalidFormResponse() {
  return NextResponse.json({ error: "请使用表单提交" }, { status: 400 });
}
