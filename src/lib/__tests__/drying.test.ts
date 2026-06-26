import { describe, it, expect } from "vitest";
import { validateBookingDates } from "@/lib/drying";
import { addDays, format, startOfDay } from "date-fns";

describe("validateBookingDates", () => {
  it("rejects dates in the past", async () => {
    const yesterday = format(addDays(startOfDay(new Date()), -1), "yyyy-MM-dd");
    const result = await validateBookingDates("fake-listing", new Date(yesterday), new Date(yesterday));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("不能早于今天");
  });

  it("rejects dates beyond max advance days", async () => {
    const far = format(addDays(startOfDay(new Date()), 30), "yyyy-MM-dd");
    const result = await validateBookingDates("fake-listing", new Date(far), new Date(far));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("最多提前");
  });
});
