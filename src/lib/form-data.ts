import { NextResponse } from "next/server";

export type MultipartResult =
  | { ok: true; formData: FormData }
  | { ok: false; response: NextResponse };

/** Parse multipart/form-data with a 400 response for invalid Content-Type. */
export async function parseMultipartForm(req: Request): Promise<MultipartResult> {
  const ct = req.headers.get("content-type") ?? "";
  if (
    !ct.includes("multipart/form-data") &&
    !ct.includes("application/x-www-form-urlencoded")
  ) {
    return {
      ok: false,
      response: NextResponse.json({ error: "请使用 multipart/form-data 提交" }, { status: 400 }),
    };
  }
  try {
    const formData = await req.formData();
    return { ok: true, formData };
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "表单数据无效" }, { status: 400 }),
    };
  }
}
