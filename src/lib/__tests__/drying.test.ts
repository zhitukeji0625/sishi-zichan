import { describe, it, expect } from "vitest";
import { validateReservationRange } from "@/lib/drying";

describe("validateReservationRange", () => {
  it("rejects end before start without throwing", async () => {
    const listingId = "nonexistent";
    const start = new Date("2026-06-10");
    const end = new Date("2026-06-01");
    const result = await validateReservationRange(listingId, start, end);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("结束日期");
    }
  });
});
