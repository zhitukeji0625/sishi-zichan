import { NextResponse } from "next/server";

export type ParseFormResult =
  | { ok: true; data: FormData }
  | { ok: false; response: NextResponse };

/** Parse multipart or urlencoded bodies; reject JSON and other types with 400. */
export async function parseFormBody(req: Request): Promise<ParseFormResult> {
  const ct = (req.headers.get("content-type") ?? "").toLowerCase();
  const isForm =
    ct.includes("multipart/form-data") || ct.includes("application/x-www-form-urlencoded");
  if (!isForm) {
    return {
      ok: false,
      response: NextResponse.json({ error: "请使用表单提交" }, { status: 400 }),
    };
  }
  try {
    return { ok: true, data: await req.formData() };
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "无法解析表单数据" }, { status: 400 }),
    };
  }
}
