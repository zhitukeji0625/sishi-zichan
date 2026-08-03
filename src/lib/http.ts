import { NextResponse } from "next/server";

type FormDataResult =
  | { ok: true; data: FormData }
  | { ok: false; response: NextResponse };

/** Parse multipart or urlencoded form data; return 400 when Content-Type is invalid. */
export async function parseFormData(req: Request): Promise<FormDataResult> {
  const contentType = req.headers.get("content-type") ?? "";
  if (
    !contentType.includes("multipart/form-data") &&
    !contentType.includes("application/x-www-form-urlencoded")
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
    return { ok: true, data: await req.formData() };
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "表单数据无效" }, { status: 400 }),
    };
  }
}
