import { NextResponse } from "next/server";

/** 解析 multipart 表单；非 multipart 或解析失败时返回 400，避免未捕获异常导致 500。 */
export async function readMultipartForm(
  req: Request,
): Promise<FormData | NextResponse> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
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
