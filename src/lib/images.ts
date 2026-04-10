/** 解析资产 imagesJson（JSON 字符串数组），解析失败或非数组时返回空数组 */
export function parseImageUrls(imagesJson: string | null | undefined): string[] {
  if (!imagesJson?.trim()) return [];
  try {
    const parsed = JSON.parse(imagesJson) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((u): u is string => typeof u === "string" && u.length > 0);
  } catch {
    return [];
  }
}
