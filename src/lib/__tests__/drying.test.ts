import { describe, it, expect } from "vitest";
import { parseLocalDate } from "@/lib/drying";

describe("parseLocalDate", () => {
  it("parses yyyy-MM-dd as local calendar date", () => {
    const d = parseLocalDate("2026-08-20");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7);
    expect(d.getDate()).toBe(20);
  });

  it("returns invalid date for bad input", () => {
    expect(parseLocalDate("bad").getTime()).toBeNaN();
  });
});
