import { NextResponse } from "next/server";

/** Parse multipart or urlencoded body; wrong Content-Type returns a 400 Response. */
export async function readFormData(req: Request): Promise<FormData | Response> {
  const ct = (req.headers.get("content-type") ?? "").toLowerCase();
  if (
    !ct.includes("multipart/form-data") &&
    !ct.includes("application/x-www-form-urlencoded")
  ) {
    return NextResponse.json(
      { error: "请使用 multipart/form-data 提交" },
      { status: 400 },
    );
  }
  try {
    return await req.formData();
  } catch {
    return NextResponse.json({ error: "表单数据无效" }, { status: 400 });
  }
}
