/** Parse asset `imagesJson` column into URL list; invalid JSON or shape yields []. */
export function parseImageUrls(imagesJson: string | null): string[] {
  if (!imagesJson) return [];
  try {
    const v = JSON.parse(imagesJson) as unknown;
    if (!Array.isArray(v)) return [];
    return v.filter((x): x is string => typeof x === "string" && x.length > 0);
  } catch {
    return [];
  }
}
