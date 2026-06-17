import { NextResponse } from "next/server";

/** multipart/form-data 接口：非 multipart 请求返回 400 */
export async function requireMultipartForm(req: Request) {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data")) {
    return { error: NextResponse.json({ error: "请使用 multipart/form-data 提交" }, { status: 400 }) };
  }
  try {
    return { formData: await req.formData() };
  } catch {
    return { error: NextResponse.json({ error: "表单数据无效" }, { status: 400 }) };
  }
}
