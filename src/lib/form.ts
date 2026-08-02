import { NextResponse } from "next/server";

export function isMultipartRequest(req: Request): boolean {
  const ct = req.headers.get("content-type") ?? "";
  return (
    ct.includes("multipart/form-data") ||
    ct.includes("application/x-www-form-urlencoded")
  );
}

export async function parseFormData(
  req: Request,
): Promise<FormData | NextResponse> {
  if (!isMultipartRequest(req)) {
    return NextResponse.json(
      { error: "请使用 multipart/form-data 提交" },
      { status: 400 },
    );
  }
  try {
    return await req.formData();
  } catch {
    return NextResponse.json({ error: "表单数据无效" }, { status: 400 });
  }
}
