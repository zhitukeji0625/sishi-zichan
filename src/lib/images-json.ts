/** 解析资产 `imagesJson`（JSON 字符串数组）；非法或空则返回 []。 */
export function parseAssetImageUrls(imagesJson: string | null | undefined): string[] {
  if (!imagesJson) return [];
  try {
    const parsed: unknown = JSON.parse(imagesJson);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}
