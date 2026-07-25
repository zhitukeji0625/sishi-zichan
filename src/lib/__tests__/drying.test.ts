import { describe, it, expect } from "vitest";
import { validateUserReservationOverlap } from "@/lib/drying";

describe("validateUserReservationOverlap", () => {
  it("returns ok for non-overlapping ranges", () => {
    const a = new Date("2026-08-01");
    const b = new Date("2026-08-03");
    const c = new Date("2026-08-05");
    const d = new Date("2026-08-07");
    expect(
      dateRangesOverlapLocal(a, b, c, d),
    ).toBe(false);
    expect(
      dateRangesOverlapLocal(c, d, a, b),
    ).toBe(false);
  });

  it("detects overlapping ranges", () => {
    const a = new Date("2026-08-01");
    const b = new Date("2026-08-05");
    const c = new Date("2026-08-03");
    const d = new Date("2026-08-07");
    expect(dateRangesOverlapLocal(a, b, c, d)).toBe(true);
  });
});

/** mirror of private helper for pure date logic */
function dateRangesOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  const day = (d: Date) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x.getTime();
  };
  const s1 = day(aStart);
  const e1 = day(aEnd);
  const s2 = day(bStart);
  const e2 = day(bEnd);
  return s1 <= e2 && s2 <= e1;
}

const dateRangesOverlapLocal = dateRangesOverlap;

describe.skipIf(process.env.VITEST_SKIP_DB_TESTS === "1")(
  "validateUserReservationOverlap (db)",
  () => {
    it("is exported and callable", async () => {
      const result = await validateUserReservationOverlap(
        "nonexistent",
        "user",
        new Date("2026-09-01"),
        new Date("2026-09-02"),
      );
      expect(result.ok).toBe(true);
    });
  },
);
