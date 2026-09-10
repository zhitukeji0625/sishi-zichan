import { NextResponse } from "next/server";

/** Parse multipart or urlencoded form bodies; return 400 instead of throwing on bad Content-Type. */
export async function parseFormData(req: Request) {
  try {
    return await req.formData();
  } catch {
    return null;
  }
}

export function invalidFormDataResponse() {
  return NextResponse.json({ error: "请使用表单提交（multipart/form-data）" }, { status: 400 });
}
