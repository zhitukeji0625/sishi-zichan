/** Parse stored JSON array of image URLs; invalid input yields []. */
export function parseImagesJson(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((u): u is string => typeof u === "string");
  } catch {
    return [];
  }
}
