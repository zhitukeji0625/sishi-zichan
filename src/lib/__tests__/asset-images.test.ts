import { describe, it, expect } from "vitest";
import { parseAssetImageUrls } from "@/lib/asset-images";

describe("parseAssetImageUrls", () => {
  it("returns empty for null or empty", () => {
    expect(parseAssetImageUrls(null)).toEqual([]);
    expect(parseAssetImageUrls("")).toEqual([]);
  });

  it("parses valid JSON array of strings", () => {
    expect(parseAssetImageUrls('["/a.jpg","/b.png"]')).toEqual(["/a.jpg", "/b.png"]);
  });

  it("filters non-strings and returns empty on invalid JSON", () => {
    expect(parseAssetImageUrls("[1,2]")).toEqual([]);
    expect(parseAssetImageUrls("not json")).toEqual([]);
  });
});
