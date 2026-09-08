import { NextResponse } from "next/server";

export type MultipartResult =
  | { ok: true; formData: FormData }
  | { ok: false; response: NextResponse };

/** Parse multipart/form-data; returns 400 for invalid Content-Type or parse errors. */
export async function parseMultipartForm(req: Request): Promise<MultipartResult> {
  const contentType = req.headers.get("content-type") ?? "";
  if (
    !contentType.includes("multipart/form-data") &&
    !contentType.includes("application/x-www-form-urlencoded")
  ) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "请使用 multipart/form-data 提交表单" },
        { status: 400 },
      ),
    };
  }

  try {
    const formData = await req.formData();
    return { ok: true, formData };
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "无效的表单请求" }, { status: 400 }),
    };
  }
}
