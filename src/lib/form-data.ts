import { NextResponse } from "next/server";

const MULTIPART_TYPES = ["multipart/form-data", "application/x-www-form-urlencoded"];

/** Parse multipart/form-data; returns 400 response when Content-Type is invalid. */
export async function parseMultipartForm(req: Request): Promise<FormData | NextResponse> {
  const contentType = req.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!MULTIPART_TYPES.some((t) => contentType === t)) {
    return NextResponse.json({ error: "请使用 multipart/form-data 提交" }, { status: 400 });
  }
  return req.formData();
}
