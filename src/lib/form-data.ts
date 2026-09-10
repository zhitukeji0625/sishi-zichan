import { NextResponse } from "next/server";

/** Parse multipart/form-data; returns 400 response on invalid Content-Type. */
export async function parseMultipartForm(req: Request) {
  try {
    return { formData: await req.formData() };
  } catch {
    return {
      error: NextResponse.json({ error: "请使用 multipart/form-data 提交" }, { status: 400 }),
    };
  }
}
