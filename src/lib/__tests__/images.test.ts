import { describe, it, expect } from "vitest";
import { parseImageUrls } from "@/lib/images";

describe("parseImageUrls", () => {
  it("returns empty for invalid shapes", () => {
    expect(parseImageUrls(null)).toEqual([]);
    expect(parseImageUrls('"not-array"')).toEqual([]);
    expect(parseImageUrls("123")).toEqual([]);
  });

  it("filters non-string entries", () => {
    expect(parseImageUrls('["/a.jpg", 1, ""]')).toEqual(["/a.jpg"]);
  });
});
