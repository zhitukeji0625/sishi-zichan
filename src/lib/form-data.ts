import { NextResponse } from "next/server";

/** Parse multipart/form-data; return 400 if Content-Type is wrong or body invalid. */
export async function parseMultipartForm(
  req: Request,
): Promise<FormData | NextResponse> {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data")) {
    return NextResponse.json({ error: "请使用 multipart/form-data" }, { status: 400 });
  }
  try {
    return await req.formData();
  } catch {
    return NextResponse.json({ error: "表单数据无效" }, { status: 400 });
  }
}
