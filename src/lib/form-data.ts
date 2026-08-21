import { NextResponse } from "next/server";

/** Parse multipart or urlencoded form bodies; return null when the request is not form data. */
export async function parseRequestFormData(req: Request): Promise<FormData | null> {
  const contentType = req.headers.get("content-type") ?? "";
  if (
    !contentType.includes("multipart/form-data") &&
    !contentType.includes("application/x-www-form-urlencoded")
  ) {
    return null;
  }
  try {
    return await req.formData();
  } catch {
    return null;
  }
}

export function invalidFormDataResponse() {
  return NextResponse.json({ error: "表单数据无效" }, { status: 400 });
}
