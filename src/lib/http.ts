import { NextResponse } from "next/server";

const MULTIPART_TYPES = ["multipart/form-data", "application/x-www-form-urlencoded"];

/** 校验 Content-Type 并解析表单；非 multipart 时返回 400 响应而非抛 500。 */
export async function requireMultipartForm(req: Request): Promise<FormData | NextResponse> {
  const ct = req.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!MULTIPART_TYPES.includes(ct)) {
    return NextResponse.json({ error: "请使用 multipart/form-data 提交" }, { status: 400 });
  }
  try {
    return await req.formData();
  } catch {
    return NextResponse.json({ error: "表单数据无效" }, { status: 400 });
  }
}
