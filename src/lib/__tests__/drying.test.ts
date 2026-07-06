import { describe, it, expect } from "vitest";
import { safeEachDayOfInterval } from "@/lib/drying";

describe("safeEachDayOfInterval", () => {
  it("returns days for valid range", () => {
    const start = new Date("2026-07-01");
    const end = new Date("2026-07-03");
    const days = safeEachDayOfInterval(start, end);
    expect(days).toHaveLength(3);
  });

  it("returns empty array when start is after end", () => {
    const start = new Date("2026-07-05");
    const end = new Date("2026-07-01");
    expect(safeEachDayOfInterval(start, end)).toEqual([]);
  });

  it("returns single day when start equals end", () => {
    const d = new Date("2026-07-01");
    expect(safeEachDayOfInterval(d, d)).toHaveLength(1);
  });
});
