/**
 * 解析资产 `imagesJson` 字段，返回图片 URL 列表；非法 JSON 或非数组时返回空数组。
 */
export function parseAssetImageUrls(imagesJson: string | null | undefined): string[] {
  if (!imagesJson) return [];
  try {
    const parsed: unknown = JSON.parse(imagesJson);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((u): u is string => typeof u === "string");
  } catch {
    return [];
  }
}
