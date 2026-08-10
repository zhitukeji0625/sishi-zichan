import { NextResponse } from "next/server";

/** Parse multipart/form-data; returns 400 JSON response on invalid Content-Type. */
export async function parseFormData(req: Request) {
  try {
    return { formData: await req.formData() } as const;
  } catch {
    return {
      error: NextResponse.json(
        { error: "请使用 multipart/form-data 或 application/x-www-form-urlencoded 提交" },
        { status: 400 },
      ),
    } as const;
  }
}
