import { describe, it, expect } from "vitest";
import { daysInRange } from "@/lib/drying";
import { format } from "date-fns";

describe("daysInRange", () => {
  it("returns empty array when end is before start", () => {
    expect(daysInRange(new Date("2026-06-10"), new Date("2026-06-08"))).toEqual([]);
  });

  it("returns inclusive days for valid range", () => {
    const days = daysInRange(new Date("2026-06-10"), new Date("2026-06-12"));
    expect(days.map((d) => format(d, "yyyy-MM-dd"))).toEqual([
      "2026-06-10",
      "2026-06-11",
      "2026-06-12",
    ]);
  });
});
