import { NextResponse } from "next/server";

type FormFields = Record<string, FormDataEntryValue>;

export type ParseFormBodyResult =
  | { ok: true; fields: FormFields }
  | { ok: false; response: NextResponse };

/** 仅接受 multipart 或 urlencoded 表单；其它 Content-Type 返回 400，避免 req.formData() 抛错导致 500。 */
export async function parseFormBody(req: Request): Promise<ParseFormBodyResult> {
  const contentType = req.headers.get("content-type") ?? "";
  const isForm =
    contentType.includes("multipart/form-data") ||
    contentType.includes("application/x-www-form-urlencoded");
  if (!isForm) {
    return {
      ok: false,
      response: NextResponse.json({ error: "请使用表单提交" }, { status: 400 }),
    };
  }
  const formData = await req.formData();
  return { ok: true, fields: Object.fromEntries(formData.entries()) };
}
