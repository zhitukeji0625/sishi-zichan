/** 解析资产 `imagesJson` 为 URL 列表；非法 JSON 或非数组时返回空数组 */
export function parseAssetImageUrls(imagesJson: string | null): string[] {
  if (!imagesJson) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(imagesJson);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((x): x is string => typeof x === "string");
}
