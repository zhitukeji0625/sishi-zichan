import { NextResponse } from "next/server";

/** Parse multipart/form-data; return 400 if Content-Type is wrong or body invalid. */
export async function parseMultipartForm(
  req: Request,
): Promise<FormData | NextResponse> {
  const contentType = req.headers.get("content-type") ?? "";
  if (
    !contentType.includes("multipart/form-data") &&
    !contentType.includes("application/x-www-form-urlencoded")
  ) {
    return NextResponse.json(
      { error: "请使用 multipart/form-data 提交" },
      { status: 400 },
    );
  }
  try {
    return await req.formData();
  } catch {
    return NextResponse.json({ error: "表单数据解析失败" }, { status: 400 });
  }
}
