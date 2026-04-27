/** 解析资产 `imagesJson` 字段，返回有效图片 URL 列表（解析失败或非数组时返回空数组） */
export function parseImageUrlsJson(json: string | null | undefined): string[] {
  if (!json?.trim()) return [];
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((u): u is string => typeof u === "string" && u.length > 0);
  } catch {
    return [];
  }
}
