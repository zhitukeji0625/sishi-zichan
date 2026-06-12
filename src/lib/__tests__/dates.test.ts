import { describe, it, expect } from "vitest";
import { parseLocalDateString, formatLocalDate } from "@/lib/dates";

describe("parseLocalDateString", () => {
  it("parses yyyy-MM-dd as local midnight", () => {
    const d = parseLocalDateString("2026-06-15");
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(5);
    expect(d!.getDate()).toBe(15);
    expect(d!.getHours()).toBe(0);
  });

  it("rejects invalid dates", () => {
    expect(parseLocalDateString("2026-02-30")).toBeNull();
    expect(parseLocalDateString("bad")).toBeNull();
  });
});

describe("formatLocalDate", () => {
  it("round-trips with parseLocalDateString", () => {
    const d = parseLocalDateString("2026-06-15")!;
    expect(formatLocalDate(d)).toBe("2026-06-15");
  });
});
