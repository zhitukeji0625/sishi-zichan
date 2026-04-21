/**
 * Parse `imagesJson` stored as JSON string array of URLs.
 * Returns `[]` when absent; `null` when JSON is invalid or not a string array.
 */
export function parseImageUrlsJson(imagesJson: string | null | undefined): string[] | null {
  if (!imagesJson) return [];
  try {
    const parsed: unknown = JSON.parse(imagesJson);
    if (!Array.isArray(parsed)) return null;
    if (!parsed.every((x): x is string => typeof x === "string")) return null;
    return parsed;
  } catch {
    return null;
  }
}
