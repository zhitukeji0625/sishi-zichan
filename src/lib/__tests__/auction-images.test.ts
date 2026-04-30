import { describe, it, expect } from "vitest";
import { parseAssetImageUrls } from "@/lib/auction-images";

describe("parseAssetImageUrls", () => {
  it("returns empty for null/undefined/empty", () => {
    expect(parseAssetImageUrls(null)).toEqual([]);
    expect(parseAssetImageUrls(undefined)).toEqual([]);
    expect(parseAssetImageUrls("")).toEqual([]);
  });

  it("parses string array and filters non-strings", () => {
    expect(parseAssetImageUrls('["/a.jpg",1,"/b.png"]')).toEqual(["/a.jpg", "/b.png"]);
  });

  it("returns empty for invalid JSON or non-array", () => {
    expect(parseAssetImageUrls("not json")).toEqual([]);
    expect(parseAssetImageUrls("{}")).toEqual([]);
  });
});
