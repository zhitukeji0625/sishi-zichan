import { describe, it, expect } from "vitest";
import { daysInReservationRange } from "@/lib/drying";

describe("daysInReservationRange", () => {
  it("returns inclusive days for a valid range", () => {
    const days = daysInReservationRange(
      new Date("2026-06-01"),
      new Date("2026-06-03"),
    );
    expect(days).toHaveLength(3);
  });

  it("returns a single day when start equals end", () => {
    const days = daysInReservationRange(
      new Date("2026-06-01"),
      new Date("2026-06-01"),
    );
    expect(days).toHaveLength(1);
  });

  it("returns empty array when end is before start", () => {
    const days = daysInReservationRange(
      new Date("2026-06-05"),
      new Date("2026-06-01"),
    );
    expect(days).toHaveLength(0);
  });
});
