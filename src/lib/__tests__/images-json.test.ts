import { describe, it, expect } from "vitest";
import { parseImageUrlsFromJson } from "@/lib/images-json";

describe("parseImageUrlsFromJson", () => {
  it("returns empty for null, undefined, empty", () => {
    expect(parseImageUrlsFromJson(null)).toEqual([]);
    expect(parseImageUrlsFromJson(undefined)).toEqual([]);
    expect(parseImageUrlsFromJson("")).toEqual([]);
  });

  it("parses string array", () => {
    expect(parseImageUrlsFromJson('["/a.jpg","/b.jpg"]')).toEqual(["/a.jpg", "/b.jpg"]);
  });

  it("filters non-strings and invalid JSON", () => {
    expect(parseImageUrlsFromJson("[1,2]")).toEqual([]);
    expect(parseImageUrlsFromJson("not json")).toEqual([]);
  });
});
