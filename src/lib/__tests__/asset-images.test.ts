import { describe, it, expect } from "vitest";
import { parseAssetImagesJson } from "@/lib/asset-images";

describe("parseAssetImagesJson", () => {
  it("returns empty array for null or invalid JSON", () => {
    expect(parseAssetImagesJson(null)).toEqual([]);
    expect(parseAssetImagesJson("not json")).toEqual([]);
  });

  it("filters to non-empty strings", () => {
    expect(parseAssetImagesJson(JSON.stringify(["a", "", 1, "b"]))).toEqual(["a", "b"]);
  });
});
