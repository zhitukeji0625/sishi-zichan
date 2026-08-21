import { NextResponse } from "next/server";

/** Parse multipart/form-data; return 400 if Content-Type is wrong. */
export async function parseFormData(req: Request) {
  const ct = req.headers.get("content-type") ?? "";
  if (
    !ct.includes("multipart/form-data") &&
    !ct.includes("application/x-www-form-urlencoded")
  ) {
    return {
      error: NextResponse.json(
        { error: "请使用 multipart/form-data 提交" },
        { status: 400 },
      ),
    } as const;
  }
  try {
    const formData = await req.formData();
    return { formData, raw: Object.fromEntries(formData.entries()) } as const;
  } catch {
    return {
      error: NextResponse.json({ error: "表单数据解析失败" }, { status: 400 }),
    } as const;
  }
}
