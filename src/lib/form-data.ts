/** Parse multipart form data; returns 400-friendly error for non-multipart requests. */
export async function parseMultipartForm(req: Request): Promise<FormData> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    throw new MultipartRequiredError();
  }
  try {
    return await req.formData();
  } catch {
    throw new MultipartRequiredError();
  }
}

export class MultipartRequiredError extends Error {
  constructor() {
    super("请求须为 multipart/form-data");
    this.name = "MultipartRequiredError";
  }
}
