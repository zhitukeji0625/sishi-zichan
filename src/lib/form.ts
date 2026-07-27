import { NextResponse } from "next/server";

export async function readFormData(
  req: Request,
): Promise<{ ok: true; formData: FormData } | { ok: false; response: NextResponse }> {
  const contentType = req.headers.get("content-type") ?? "";
  if (
    !contentType.includes("multipart/form-data") &&
    !contentType.includes("application/x-www-form-urlencoded")
  ) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "请使用表单提交（multipart/form-data）" },
        { status: 400 },
      ),
    };
  }
  try {
    return { ok: true, formData: await req.formData() };
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "无法解析表单数据" }, { status: 400 }),
    };
  }
}
