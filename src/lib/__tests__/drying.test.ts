import { describe, it, expect } from "vitest";
import { safeEachDayOfInterval } from "@/lib/drying";

describe("safeEachDayOfInterval", () => {
  it("returns single day when end is before start", () => {
    const start = new Date("2026-06-05");
    const end = new Date("2026-06-01");
    const days = safeEachDayOfInterval(start, end);
    expect(days).toHaveLength(1);
  });

  it("returns inclusive range for valid interval", () => {
    const start = new Date("2026-06-01");
    const end = new Date("2026-06-03");
    const days = safeEachDayOfInterval(start, end);
    expect(days).toHaveLength(3);
  });
});
