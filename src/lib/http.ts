import { NextResponse } from "next/server";

/** 安全读取 multipart / urlencoded 表单；错误 Content-Type 或解析失败时返回 400 响应。 */
export async function readMultipartForm(req: Request): Promise<FormData | Response> {
  const contentType = req.headers.get("content-type") ?? "";
  if (
    !contentType.includes("multipart/form-data") &&
    !contentType.includes("application/x-www-form-urlencoded")
  ) {
    return NextResponse.json(
      { error: "Content-Type 必须为 multipart/form-data 或 application/x-www-form-urlencoded" },
      { status: 400 },
    );
  }
  try {
    return await req.formData();
  } catch {
    return NextResponse.json({ error: "无法解析表单数据" }, { status: 400 });
  }
}
