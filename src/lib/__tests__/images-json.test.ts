import { describe, it, expect } from "vitest";
import { parseImageUrlsFromJson } from "@/lib/images-json";

describe("parseImageUrlsFromJson", () => {
  it("returns [] for null/empty", () => {
    expect(parseImageUrlsFromJson(null)).toEqual([]);
    expect(parseImageUrlsFromJson(undefined)).toEqual([]);
    expect(parseImageUrlsFromJson("")).toEqual([]);
  });

  it("parses valid JSON array of strings", () => {
    expect(parseImageUrlsFromJson('["a","b"]')).toEqual(["a", "b"]);
  });

  it("filters non-strings and invalid JSON", () => {
    expect(parseImageUrlsFromJson('["ok",1,null]')).toEqual(["ok"]);
    expect(parseImageUrlsFromJson("{")).toEqual([]);
    expect(parseImageUrlsFromJson("{}")).toEqual([]);
  });
});
