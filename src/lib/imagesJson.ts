/** 解析资产等字段中存储的图片 URL JSON 数组，解析失败时返回空数组 */
export function parseImageUrls(imagesJson: string | null | undefined): string[] {
  if (!imagesJson) return [];
  try {
    const parsed = JSON.parse(imagesJson) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((u): u is string => typeof u === "string");
  } catch {
    return [];
  }
}
