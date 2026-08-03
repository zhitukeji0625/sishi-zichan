import { NextResponse } from "next/server";

function isMultipartContentType(contentType: string) {
  return (
    contentType.includes("multipart/form-data") ||
    contentType.includes("application/x-www-form-urlencoded")
  );
}

/** Parse multipart form data; returns a 400 response when Content-Type is invalid. */
export async function parseMultipartFormData(req: Request) {
  const contentType = req.headers.get("content-type") ?? "";
  if (!isMultipartContentType(contentType)) {
    return {
      error: NextResponse.json({ error: "请求须为 multipart/form-data" }, { status: 400 }),
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
