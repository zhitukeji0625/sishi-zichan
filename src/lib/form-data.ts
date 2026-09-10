import { NextResponse } from "next/server";

export type MultipartFormResult =
  | { ok: true; formData: FormData }
  | { ok: false; response: NextResponse };

/** Parse multipart or urlencoded form; return 400 instead of throwing on bad Content-Type. */
export async function parseMultipartForm(req: Request): Promise<MultipartFormResult> {
  const contentType = req.headers.get("content-type") ?? "";
  if (
    !contentType.includes("multipart/form-data") &&
    !contentType.includes("application/x-www-form-urlencoded")
  ) {
    return {
      ok: false,
      response: NextResponse.json({ error: "需要 multipart/form-data 表单" }, { status: 400 }),
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
