/** 安全解析 multipart/form-data；Content-Type 不符时返回 null 而非抛错。 */
export async function safeFormData(req: Request): Promise<FormData | null> {
  try {
    return await req.formData();
  } catch {
    return null;
  }
}
