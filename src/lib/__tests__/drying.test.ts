import { describe, it, expect } from "vitest";
import { parseLocalDate } from "@/lib/drying";
import { format, startOfDay } from "date-fns";

describe("parseLocalDate", () => {
  it("parses yyyy-MM-dd as local start-of-day", () => {
    const d = parseLocalDate("2026-09-12");
    expect(d).not.toBeNull();
    expect(format(d!, "yyyy-MM-dd")).toBe("2026-09-12");
    expect(d!.getTime()).toBe(startOfDay(new Date(2026, 8, 12)).getTime());
  });

  it("returns null for invalid input", () => {
    expect(parseLocalDate("not-a-date")).toBeNull();
    expect(parseLocalDate("2026-13-40")).toBeNull();
  });
});
