import { NextResponse } from "next/server";

/** 管理端表单上传接口要求 multipart，避免 JSON 请求触发 formData() 500。 */
export function requireMultipartForm(req: Request): NextResponse | null {
  const ct = req.headers.get("content-type") ?? "";
  if (
    !ct.includes("multipart/form-data") &&
    !ct.includes("application/x-www-form-urlencoded")
  ) {
    return NextResponse.json(
      { error: "请使用 multipart/form-data 提交" },
      { status: 400 },
    );
  }
  return null;
}
