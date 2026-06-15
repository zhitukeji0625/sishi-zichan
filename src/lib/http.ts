import { NextResponse } from "next/server";

type MultipartResult =
  | { formData: FormData; error?: undefined }
  | { formData?: undefined; error: NextResponse };

/** 要求请求为 multipart/form-data，否则返回 400 */
export async function requireMultipartForm(req: Request): Promise<MultipartResult> {
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
      error: NextResponse.json({ error: "无法解析表单数据" }, { status: 400 }),
    };
  }
}
