import { NextResponse } from "next/server";

/** Parse multipart or urlencoded form body; return 400 instead of throwing on wrong Content-Type. */
export async function parseFormData(req: Request): Promise<FormData | NextResponse> {
  try {
    return await req.formData();
  } catch {
    return NextResponse.json({ error: "请使用表单提交" }, { status: 400 });
  }
}
