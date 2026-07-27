import { NextResponse } from "next/server";

export type ReadFormDataResult =
  | { ok: true; formData: FormData }
  | { ok: false; response: NextResponse };

/** 仅接受 multipart/form-data，避免对 JSON 等调用 formData() 时抛出 500 */
export async function readFormData(req: Request): Promise<ReadFormDataResult> {
  const contentType = req.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "请使用 multipart/form-data 提交" },
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
      response: NextResponse.json({ error: "无法解析表单数据" }, { status: 400 }),
    };
  }
}
