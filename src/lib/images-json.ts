/** Parse asset `imagesJson` (array of URL strings). Invalid JSON returns []. */
export function parseImageUrlsFromJson(imagesJson: string | null | undefined): string[] {
  if (!imagesJson) return [];
  try {
    const parsed: unknown = JSON.parse(imagesJson);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((u): u is string => typeof u === "string");
  } catch {
    return [];
  }
}
