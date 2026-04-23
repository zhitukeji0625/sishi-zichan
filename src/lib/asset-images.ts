export function parseAssetImagesJson(imagesJson: string | null): string[] {
  if (!imagesJson) return [];
  try {
    const parsed: unknown = JSON.parse(imagesJson);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((url): url is string => typeof url === "string" && url.length > 0);
  } catch {
    return [];
  }
}
