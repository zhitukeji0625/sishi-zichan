import { describe, it, expect } from "vitest";
import { parseImageUrls } from "@/lib/images";

describe("parseImageUrls", () => {
  it("returns empty for null, undefined, empty", () => {
    expect(parseImageUrls(null)).toEqual([]);
    expect(parseImageUrls(undefined)).toEqual([]);
    expect(parseImageUrls("")).toEqual([]);
    expect(parseImageUrls("   ")).toEqual([]);
  });

  it("parses valid JSON array of strings", () => {
    expect(parseImageUrls('["/a.jpg","/b.png"]')).toEqual(["/a.jpg", "/b.png"]);
  });

  it("filters non-strings and empty strings", () => {
    expect(parseImageUrls('["/ok",1,"",null]')).toEqual(["/ok"]);
  });

  it("returns empty on invalid JSON or non-array", () => {
    expect(parseImageUrls("{")).toEqual([]);
    expect(parseImageUrls('"x"')).toEqual([]);
    expect(parseImageUrls("{}")).toEqual([]);
  });
});
