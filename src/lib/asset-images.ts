/** 解析资产图集 JSON（非法或空则返回空数组）。 */
export function parseAssetImageUrls(imagesJson: string | null): string[] {
  if (!imagesJson) return [];
  try {
    const parsed: unknown = JSON.parse(imagesJson);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((u): u is string => typeof u === "string");
  } catch {
    return [];
  }
}
