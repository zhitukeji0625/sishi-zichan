import { NextResponse } from "next/server";

type ParseResult =
  | { ok: true; formData: FormData }
  | { ok: false; response: NextResponse };

/** Parse multipart form body; returns 400 when Content-Type is not multipart. */
export async function parseMultipartForm(req: Request): Promise<ParseResult> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return {
      ok: false,
      response: NextResponse.json({ error: "需要 multipart/form-data" }, { status: 400 }),
    };
  }
  try {
    return { ok: true, formData: await req.formData() };
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "表单数据无效" }, { status: 400 }),
    };
  }
}
