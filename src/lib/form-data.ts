import { NextResponse } from "next/server";

/**
 * Parse multipart/form-data request body.
 * Returns 400 if Content-Type is not multipart.
 */
export async function parseMultipartForm(req: Request) {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data")) {
    return {
      error: NextResponse.json({ error: "需要 multipart/form-data" }, { status: 400 }),
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
