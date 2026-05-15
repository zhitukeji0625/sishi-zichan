/** Parse `Asset.imagesJson` into a list of image URLs; invalid JSON or shape yields []. */
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
