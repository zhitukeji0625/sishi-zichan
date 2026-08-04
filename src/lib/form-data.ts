import { NextResponse } from "next/server";

const FORM_CONTENT_TYPES = [
  "multipart/form-data",
  "application/x-www-form-urlencoded",
];

export async function parseFormData(
  req: Request,
): Promise<FormData | NextResponse> {
  const contentType = req.headers.get("content-type") ?? "";
  const isForm = FORM_CONTENT_TYPES.some((t) => contentType.includes(t));
  if (!isForm) {
    return NextResponse.json(
      { error: "请求须为 multipart/form-data 或 application/x-www-form-urlencoded" },
      { status: 400 },
    );
  }
  try {
    return await req.formData();
  } catch {
    return NextResponse.json({ error: "无法解析表单数据" }, { status: 400 });
  }
}
