import { NextResponse } from "next/server";

export async function parseFormData(req: Request): Promise<FormData | null> {
  try {
    return await req.formData();
  } catch {
    return null;
  }
}

export function invalidFormDataResponse() {
  return NextResponse.json({ error: "表单数据无效" }, { status: 400 });
}
