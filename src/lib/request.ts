/** Parse string fields from JSON, urlencoded, or multipart form bodies. */
export async function parseRequestFields(req: Request): Promise<Record<string, string>> {
  const contentType = req.headers.get("content-type")?.toLowerCase() ?? "";

  if (
    contentType.includes("multipart/form-data") ||
    contentType.includes("application/x-www-form-urlencoded")
  ) {
    const formData = await req.formData();
    return Object.fromEntries(
      [...formData.entries()].filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    );
  }

  const text = await req.text();
  if (!text.trim()) return {};

  try {
    const body = JSON.parse(text) as unknown;
    if (body && typeof body === "object" && !Array.isArray(body)) {
      return Object.fromEntries(
        Object.entries(body as Record<string, unknown>)
          .filter(([, v]) => v != null)
          .map(([k, v]) => [k, String(v)]),
      );
    }
  } catch {
    // not JSON — try urlencoded body (e.g. missing Content-Type)
  }

  return Object.fromEntries(new URLSearchParams(text));
}
