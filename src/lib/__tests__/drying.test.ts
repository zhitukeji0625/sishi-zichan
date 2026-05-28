import { describe, it, expect } from "vitest";
import { validateBookingWindow } from "@/lib/drying";

const today = new Date("2026-05-28T12:00:00Z");

describe("validateBookingWindow", () => {
  it("rejects start date before today", () => {
    const r = validateBookingWindow(
      new Date("2026-05-27"),
      new Date("2026-05-27"),
      7,
      today,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("今天");
  });

  it("rejects dates beyond max advance days", () => {
    const r = validateBookingWindow(
      new Date("2026-06-10"),
      new Date("2026-06-10"),
      7,
      today,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("7");
  });

  it("accepts dates within the window", () => {
    const r = validateBookingWindow(
      new Date("2026-05-30"),
      new Date("2026-06-02"),
      7,
      today,
    );
    expect(r.ok).toBe(true);
  });
});
