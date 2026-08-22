import { NextResponse } from "next/server";

const FORM_CONTENT_TYPES = ["multipart/form-data", "application/x-www-form-urlencoded"];

/**
 * 解析表单请求体。非 multipart/form-urlencoded 时返回 400 响应，避免 req.formData() 抛出 500。
 */
export async function parseRequestFormData(
  req: Request,
): Promise<FormData | NextResponse> {
  const contentType = req.headers.get("content-type") ?? "";
  const isForm = FORM_CONTENT_TYPES.some((t) => contentType.includes(t));
  if (!isForm) {
    return NextResponse.json(
      { error: "请使用 multipart/form-data 或 application/x-www-form-urlencoded 提交表单" },
      { status: 400 },
    );
  }
  try {
    return await req.formData();
  } catch {
    return NextResponse.json({ error: "表单数据无效" }, { status: 400 });
  }
}
