import { NextResponse } from "next/server";

export async function parseMultipartFormData(req: Request) {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return {
      error: NextResponse.json({ error: "请使用 multipart/form-data 提交" }, { status: 400 }),
    } as const;
  }
  try {
    const formData = await req.formData();
    return { formData } as const;
  } catch {
    return {
      error: NextResponse.json({ error: "无法解析表单数据" }, { status: 400 }),
    } as const;
  }
}
