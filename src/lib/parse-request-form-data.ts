import { NextResponse } from "next/server";

/** Parses multipart or urlencoded bodies; returns 400 instead of throwing on bad Content-Type. */
export async function parseRequestFormData(
  req: Request,
): Promise<FormData | NextResponse> {
  const contentType = req.headers.get("content-type") ?? "";
  if (
    !contentType.includes("multipart/form-data") &&
    !contentType.includes("application/x-www-form-urlencoded")
  ) {
    return NextResponse.json(
      { error: "请使用 multipart/form-data 或 application/x-www-form-urlencoded 提交" },
      { status: 400 },
    );
  }
  try {
    return await req.formData();
  } catch {
    return NextResponse.json({ error: "无法解析表单数据" }, { status: 400 });
  }
}
