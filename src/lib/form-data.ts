import { NextResponse } from "next/server";

/** Parse multipart or urlencoded form; return 400 when Content-Type is invalid. */
export async function parseMultipartForm(
  req: Request,
): Promise<FormData | NextResponse> {
  const contentType = req.headers.get("content-type") ?? "";
  if (
    !contentType.includes("multipart/form-data") &&
    !contentType.includes("application/x-www-form-urlencoded")
  ) {
    return NextResponse.json(
      { error: "需要 multipart/form-data 表单" },
      { status: 400 },
    );
  }
  try {
    return await req.formData();
  } catch {
    return NextResponse.json({ error: "表单解析失败" }, { status: 400 });
  }
}
