import { NextResponse } from "next/server";

/** Parse multipart/form-data; return 400 response when Content-Type is invalid. */
export async function parseMultipartForm(req: Request) {
  try {
    return { formData: await req.formData() };
  } catch {
    return {
      error: NextResponse.json({ error: "请求须为 multipart/form-data" }, { status: 400 }),
    };
  }
}
