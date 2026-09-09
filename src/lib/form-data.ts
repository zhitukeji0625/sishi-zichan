export class MultipartRequiredError extends Error {
  constructor() {
    super("请求须为 multipart/form-data");
    this.name = "MultipartRequiredError";
  }
}

/** Parse multipart form data; rejects non-multipart requests with MultipartRequiredError. */
export async function parseMultipartForm(req: Request): Promise<FormData> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    throw new MultipartRequiredError();
  }
  return req.formData();
}
