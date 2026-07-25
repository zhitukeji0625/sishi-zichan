import { NextResponse } from "next/server";

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
    return NextResponse.json({ error: "无法解析上传表单" }, { status: 400 });
  }
}
