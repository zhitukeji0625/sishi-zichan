import { NextResponse } from "next/server";

/** 解析 multipart/form-data；无 body 或格式错误时返回 400 响应。 */
export async function requireMultipartForm(req: Request) {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return {
      error: NextResponse.json({ error: "请使用 multipart/form-data 提交" }, { status: 400 }),
    };
  }
  try {
    const formData = await req.formData();
    return { formData };
  } catch {
    return {
      error: NextResponse.json({ error: "表单数据无效" }, { status: 400 }),
    };
  }
}
