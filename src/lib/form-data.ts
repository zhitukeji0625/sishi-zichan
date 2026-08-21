import { NextResponse } from "next/server";

/** Parse multipart/form-urlencoded body; return 400 when Content-Type is wrong. */
export async function parseFormData(
  req: Request,
): Promise<FormData | NextResponse> {
  const ct = req.headers.get("content-type") ?? "";
  if (
    !ct.includes("multipart/form-data") &&
    !ct.includes("application/x-www-form-urlencoded")
  ) {
    return NextResponse.json(
      { error: "请使用 multipart/form-data 提交表单" },
      { status: 400 },
    );
  }
  try {
    return await req.formData();
  } catch {
    return NextResponse.json({ error: "表单数据无效" }, { status: 400 });
  }
}
