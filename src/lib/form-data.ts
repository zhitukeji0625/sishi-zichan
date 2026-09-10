import { NextResponse } from "next/server";

/** Returns 400 if Content-Type is not multipart/form-data. */
export async function parseMultipartForm(req: Request) {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data")) {
    return {
      error: NextResponse.json({ error: "请使用 multipart/form-data 提交" }, { status: 400 }),
    } as const;
  }
  try {
    const formData = await req.formData();
    return { formData } as const;
  } catch {
    return {
      error: NextResponse.json({ error: "表单数据无效" }, { status: 400 }),
    } as const;
  }
}
