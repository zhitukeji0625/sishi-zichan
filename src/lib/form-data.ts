import { NextResponse } from "next/server";

/** Thrown when the request is not a valid multipart or urlencoded form. */
export class MultipartParseError extends Error {
  readonly status = 400;
  constructor(message = "需要 multipart 表单") {
    super(message);
    this.name = "MultipartParseError";
  }
}

/** Parse multipart or urlencoded form data; throws MultipartParseError on invalid Content-Type. */
export async function parseMultipartForm(req: Request): Promise<FormData> {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data") && !ct.includes("application/x-www-form-urlencoded")) {
    throw new MultipartParseError();
  }
  try {
    return await req.formData();
  } catch {
    throw new MultipartParseError("表单解析失败");
  }
}

export function multipartErrorResponse(e: unknown): NextResponse | null {
  if (e instanceof MultipartParseError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  return null;
}
