/** 解析 multipart 表单或 JSON 请求体为键值对象（管理端表单与 API 调试共用） */
export async function parseRequestFields(
  req: Request,
): Promise<Record<string, unknown> | null> {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const json = await req.json().catch(() => null);
    if (json && typeof json === "object" && !Array.isArray(json)) {
      return json as Record<string, unknown>;
    }
    return null;
  }
  try {
    const formData = await req.formData();
    return Object.fromEntries(formData.entries());
  } catch {
    return null;
  }
}
