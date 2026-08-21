import { NextResponse } from "next/server";

export type FormDataResult =
  | { ok: true; formData: FormData }
  | { ok: false; response: NextResponse };

/** Parse multipart/form-data; return 400 instead of throwing on wrong Content-Type. */
export async function parseFormData(req: Request): Promise<FormDataResult> {
  const ct = req.headers.get("content-type") ?? "";
  if (
    !ct.includes("multipart/form-data") &&
    !ct.includes("application/x-www-form-urlencoded")
  ) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "请使用 multipart/form-data 提交" },
        { status: 400 },
      ),
    };
  }
  try {
    return { ok: true, formData: await req.formData() };
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "表单解析失败" }, { status: 400 }),
    };
  }
}
