/** 非 multipart 请求时 Next 的 formData() 会抛错，统一返回 null 由路由返回 400 */
export async function readFormData(req: Request): Promise<FormData | null> {
  try {
    return await req.formData();
  } catch {
    return null;
  }
}
