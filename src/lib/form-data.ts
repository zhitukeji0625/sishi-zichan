import { NextResponse } from "next/server";

/** Parse multipart/form-data; return 400 response when body is not multipart. */
export async function parseMultipartForm(req: Request) {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data")) {
    return {
      error: NextResponse.json(
        { error: "请使用 multipart/form-data 提交表单" },
        { status: 400 },
      ),
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
