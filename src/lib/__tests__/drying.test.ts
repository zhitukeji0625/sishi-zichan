import { describe, it, expect } from "vitest";
import { dateRangesOverlap } from "@/lib/drying";

describe("dateRangesOverlap", () => {
  it("detects overlapping ranges", () => {
    expect(
      dateRangesOverlap(
        new Date("2026-05-01"),
        new Date("2026-05-05"),
        new Date("2026-05-03"),
        new Date("2026-05-10"),
      ),
    ).toBe(true);
  });

  it("treats adjacent ranges as non-overlapping", () => {
    expect(
      dateRangesOverlap(
        new Date("2026-05-01"),
        new Date("2026-05-03"),
        new Date("2026-05-04"),
        new Date("2026-05-06"),
      ),
    ).toBe(false);
  });
});
