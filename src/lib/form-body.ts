import { NextResponse } from "next/server";

/** Parse multipart or urlencoded admin form posts; reject JSON with 400 instead of 500. */
export async function parseFormBody(
  req: Request,
): Promise<Record<string, FormDataEntryValue> | NextResponse> {
  const ct = req.headers.get("content-type") ?? "";
  if (
    !ct.includes("multipart/form-data") &&
    !ct.includes("application/x-www-form-urlencoded")
  ) {
    return NextResponse.json({ error: "请使用表单提交" }, { status: 400 });
  }
  try {
    const formData = await req.formData();
    return Object.fromEntries(formData.entries());
  } catch {
    return NextResponse.json({ error: "表单数据无效" }, { status: 400 });
  }
}
