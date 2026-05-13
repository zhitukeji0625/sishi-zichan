import { describe, it, expect } from "vitest";
import { parseAssetImageUrls } from "@/lib/asset-images";

describe("parseAssetImageUrls", () => {
  it("returns empty for null or blank", () => {
    expect(parseAssetImageUrls(null)).toEqual([]);
    expect(parseAssetImageUrls("")).toEqual([]);
  });

  it("parses string array", () => {
    expect(parseAssetImageUrls('["/a.jpg","/b.png"]')).toEqual(["/a.jpg", "/b.png"]);
  });

  it("filters non-strings and invalid json", () => {
    expect(parseAssetImageUrls('["ok",1,null]')).toEqual(["ok"]);
    expect(parseAssetImageUrls("{")).toEqual([]);
    expect(parseAssetImageUrls("{}")).toEqual([]);
  });
});
